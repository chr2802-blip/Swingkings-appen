"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireSuperAdmin, requireTeamUser, requireUser } from "@/lib/auth";
import { assertTeamAdmin, canAccessTeam } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { readForm, requiredText, wholeNumber } from "@/lib/form";
import { generateInviteCode, hashInviteCode } from "@/lib/invite-code";
import { discardReplaced, readPhotoChoice } from "@/lib/photos";
import { normalizeCalendarUrl } from "@/lib/ical";
import { THEMES } from "@/lib/theme";

const ROLES = ["ADMIN", "TREASURER", "PLAYER"] as const;
const INVITE_DAYS = 14;

/** Moves which team is on screen. Grants nothing: it must already be one of theirs. */
export async function switchTeam(teamId: string) {
  const user = await requireUser();
  if (!canAccessTeam(user, teamId)) redirect("/oversigt");
  await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: teamId } });
  revalidatePath("/", "layout");
  redirect("/oversigt");
}

const teamSchema = z.object({
  name: requiredText("Giv holdet et navn."),
  theme: z.enum(THEMES.map((t) => t.value) as [string, ...string[]]).optional(),
  finePriceKr: wholeNumber("Prisen for én bøde skal være et helt antal kroner (1–1000).", 1, 1000),
  calendarUrl: z.string().trim().max(2000).optional(),
});

export async function updateTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(teamSchema, formData);
  if (!form.ok) return fail(form.error);

  let calendarUrl: string | null = null;
  if (form.fields.calendarUrl) {
    const url = normalizeCalendarUrl(form.fields.calendarUrl);
    if (!url) return fail("Kalenderlinket er ikke en gyldig adresse. Kopiér det fra “Eksporter kalender” i KampKlar.");
    calendarUrl = url.toString();
  }

  const photo = await readPhotoChoice(formData, user.teamId);
  if (!photo.ok) return fail(photo.error);

  const before = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { photoId: true } });
  await prisma.team.update({
    where: { id: user.teamId },
    data: {
      name: form.fields.name,
      finePriceKr: form.fields.finePriceKr,
      calendarUrl,
      ...(form.fields.theme ? { theme: form.fields.theme as (typeof THEMES)[number]["value"] } : {}),
      ...(photo.photoId !== undefined ? { photoId: photo.photoId } : {}),
    },
  });
  await discardReplaced(user.teamId, before.photoId, photo.photoId);
  revalidatePath("/", "layout");
  return ok();
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Skriv en gyldig e-mail."),
  role: z.enum(ROLES),
});

/**
 * There is no mail server: the admin gets a one-time code to pass on however they like
 * (SMS, Messenger, i omklædningsrummet). The code is stored hashed and shown once.
 */
export async function createInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(inviteSchema, formData);
  if (!form.ok) return fail(form.error);

  const member = await teamDb(user.teamId).teamMember.findFirst({
    where: { user: { email: form.fields.email } },
    select: { userId: true },
  });
  if (member) return fail("Den e-mail er allerede på holdet.");

  const code = generateInviteCode();
  await teamDb(user.teamId).invite.create({
    data: {
      teamId: user.teamId,
      email: form.fields.email,
      role: form.fields.role,
      codeHash: hashInviteCode(code),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      createdById: user.id,
    },
  });
  revalidatePath("/hold");
  return ok(`Koden er ${code}. Send den til ${form.fields.email} sammen med linket /accept-invite — den vises kun nu.`);
}

export async function revokeInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  await teamDb(user.teamId).invite.deleteMany({ where: { id: String(formData.get("inviteId") ?? "") } });
  revalidatePath("/hold");
  return ok();
}

const memberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
  shirtNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 999), "Trøjenummeret skal være et tal."),
  takesTasks: z.enum(["on", "off"]).optional(),
});

export async function updateMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  // The checkbox sends a hidden "off" first, so an unticked box still says something.
  const form = readForm(memberSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);

  const member = await db.teamMember.findFirst({ where: { userId: form.fields.userId } });
  if (!member) return fail("Spilleren er ikke på holdet længere.");

  if (member.role === "ADMIN" && form.fields.role !== "ADMIN") {
    const admins = await db.teamMember.count({ where: { role: "ADMIN" } });
    if (admins <= 1) return fail("Holdet skal have mindst én træner/holdleder.");
  }

  await db.teamMember.updateMany({
    where: { userId: form.fields.userId },
    data: {
      role: form.fields.role,
      shirtNumber: form.fields.shirtNumber,
      takesTasks: formData.getAll("takesTasks").includes("on"),
    },
  });
  revalidatePath("/hold", "layout");
  return ok();
}

/** Removes the membership and nothing else: their fines and posts stay with the team. */
export async function removeMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const userId = String(formData.get("userId") ?? "");
  const db = teamDb(user.teamId);
  const member = await db.teamMember.findFirst({ where: { userId } });
  if (!member) return ok();
  if (member.role === "ADMIN" && (await db.teamMember.count({ where: { role: "ADMIN" } })) <= 1) {
    return fail("Holdet skal have mindst én træner/holdleder.");
  }
  await db.teamMember.deleteMany({ where: { userId } });
  // Their open jobs on this team go back to nobody, rather than waiting on somebody gone.
  await prisma.taskAssignee.deleteMany({ where: { userId, task: { teamId: user.teamId, doneAt: null } } });
  revalidatePath("/hold", "layout");
  return ok();
}

const createTeamSchema = z.object({
  name: requiredText("Giv holdet et navn."),
  adminEmail: z.string().trim().toLowerCase().email("Skriv trænerens e-mail.").optional().or(z.literal("")),
});

/**
 * The super admin creates a team and, optionally, invites its first admin. They join it
 * themselves only if no admin email is given — somebody has to be able to run it.
 */
export async function createTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const form = readForm(createTeamSchema, formData);
  if (!form.ok) return fail(form.error);

  const team = await prisma.team.create({ data: { name: form.fields.name } });
  let note = `${team.name} er oprettet.`;
  if (form.fields.adminEmail) {
    const code = generateInviteCode();
    await prisma.invite.create({
      data: {
        teamId: team.id,
        email: form.fields.adminEmail,
        role: "ADMIN",
        codeHash: hashInviteCode(code),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
        createdById: user.id,
      },
    });
    note += ` Træneren (${form.fields.adminEmail}) kan oprette sig med koden ${code}.`;
  } else {
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, role: "ADMIN" } });
    await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
  }
  revalidatePath("/", "layout");
  return ok(note);
}

export async function deleteTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.team.deleteMany({ where: { id: String(formData.get("teamId") ?? "") } });
  revalidatePath("/", "layout");
  return ok();
}

/** A super admin looks into any team without joining it. */
export async function visitTeam(teamId: string) {
  const user = await requireSuperAdmin();
  await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: teamId } });
  revalidatePath("/", "layout");
  redirect("/oversigt");
}
