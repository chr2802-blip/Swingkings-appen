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
import { generateLinkToken, hashLinkToken, joinPath } from "@/lib/invite-links";
import { LINK_DAYS, LINK_MAX_USES } from "@/lib/invite-link-options";
import { discardReplaced, readPhotoChoice, removeStored } from "@/lib/photos";
import { normalizeCalendarUrl } from "@/lib/ical";
import { normalizeBox, normalizeBoxLink } from "@/lib/pay";
import { THEMES } from "@/lib/theme";
import { createDemoTeam, removeDemoTeam } from "@/lib/demo-team";

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
  mobilePayBox: z.string().trim().max(40).optional(),
  mobilePayLink: z.string().trim().max(500).optional(),
  duesKr: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 100_000), "Kontingentet skal være et helt antal kroner."),
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

  let mobilePayBox: string | null = null;
  if (form.fields.mobilePayBox) {
    mobilePayBox = normalizeBox(form.fields.mobilePayBox);
    if (!mobilePayBox) return fail("Boxnummeret er bogstaver og tal, fx 9162TV.");
  }
  let mobilePayLink: string | null = null;
  if (form.fields.mobilePayLink) {
    mobilePayLink = normalizeBoxLink(form.fields.mobilePayLink);
    if (!mobilePayLink) return fail("Linket skal være boxens eget fra MobilePay: https://qr.mobilepay.dk/box/…/pay-in");
  }

  const before = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { photoId: true } });
  const photo = await readPhotoChoice(formData, user.teamId, before.photoId);
  if (!photo.ok) return fail(photo.error);

  await prisma.team.update({
    where: { id: user.teamId },
    data: {
      name: form.fields.name,
      finePriceKr: form.fields.finePriceKr,
      calendarUrl,
      // Left alone by a form that does not carry the fields.
      ...(formData.has("mobilePayBox") ? { mobilePayBox } : {}),
      ...(formData.has("mobilePayLink") ? { mobilePayLink } : {}),
      ...(formData.has("duesKr") ? { duesKr: form.fields.duesKr } : {}),
      ...(form.fields.theme ? { theme: form.fields.theme as (typeof THEMES)[number]["value"] } : {}),
      ...(photo.photoId !== undefined ? { photoId: photo.photoId } : {}),
    },
  });
  await discardReplaced(user.teamId, before.photoId, photo.photoId);
  revalidatePath("/", "layout");
  return ok();
}

const inviteLinkSchema = z.object({
  days: z.coerce.number().refine((d) => (LINK_DAYS as readonly number[]).includes(d), "Vælg hvor længe linket gælder."),
  maxUses: z.coerce
    .number()
    .refine((n) => (LINK_MAX_USES as readonly number[]).includes(n), "Vælg hvor mange der kan bruge linket."),
});

async function makeInviteLink(teamId: string, createdById: string, days: number, maxUses: number) {
  const token = generateLinkToken();
  await teamDb(teamId).inviteLink.create({
    data: {
      teamId,
      tokenHash: hashLinkToken(token),
      maxUses,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdById,
    },
  });
  return joinPath(token);
}

/**
 * There is no mail server: the admin gets a link to post wherever the team talks (SMS,
 * Messenger…). Only its hash is stored, so the note carrying the path is the one time it
 * is shown; the browser puts its own origin in front of it.
 */
export async function createInviteLink(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(inviteLinkSchema, formData);
  if (!form.ok) return fail(form.error);
  const path = await makeInviteLink(user.teamId, user.id, form.fields.days, form.fields.maxUses);
  revalidatePath("/hold");
  return ok(path);
}

export async function revokeInviteLink(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  await teamDb(user.teamId).inviteLink.deleteMany({ where: { id: String(formData.get("linkId") ?? "") } });
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
  duesPaid: z.enum(["on", "off"]).optional(),
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
    if (admins <= 1) return fail("Holdet skal have mindst én admin.");
  }

  // Kontingent: marked when it is ticked and was not, so the date says when it was paid;
  // left alone by a form that does not carry the box.
  const duesPaid = formData.has("duesPaid") ? formData.getAll("duesPaid").includes("on") : undefined;
  await db.teamMember.updateMany({
    where: { userId: form.fields.userId },
    data: {
      role: form.fields.role,
      shirtNumber: form.fields.shirtNumber,
      takesTasks: formData.getAll("takesTasks").includes("on"),
      ...(duesPaid === undefined ? {} : { duesPaidAt: duesPaid ? (member.duesPaidAt ?? new Date()) : null }),
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
    return fail("Holdet skal have mindst én admin.");
  }
  // Their open jobs on this team go back to nobody, rather than waiting on somebody gone.
  await prisma.$transaction([
    db.teamMember.deleteMany({ where: { userId } }),
    prisma.taskAssignee.deleteMany({ where: { userId, task: { teamId: user.teamId, doneAt: null } } }),
  ]);
  revalidatePath("/hold", "layout");
  return ok();
}

const createTeamSchema = z.object({
  name: requiredText("Giv holdet et navn."),
  adminLink: z.enum(["on"]).optional(),
});

/**
 * The super admin creates a team and, optionally, a one-use link for its first coach.
 * They join it themselves only if no link is asked for — somebody has to be able to run it.
 */
export async function createTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const form = readForm(createTeamSchema, formData);
  if (!form.ok) return fail(form.error);

  const team = await prisma.team.create({ data: { name: form.fields.name } });
  if (form.fields.adminLink) {
    // One place: the coach joins as a player, and is made admin under Holdindstillinger
    // (the super admin can open any team's).
    const path = await makeInviteLink(team.id, user.id, INVITE_DAYS, 1);
    revalidatePath("/", "layout");
    return ok(path);
  }
  await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, role: "ADMIN" } });
  await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
  revalidatePath("/", "layout");
  return ok(`${team.name} er oprettet, og du er træner på det.`);
}

export async function deleteTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = String(formData.get("teamId") ?? "");
  // The rows go with the team; the objects in storage do not, so their names are read first.
  const stored = await prisma.photo.findMany({ where: { teamId: id, storageKey: { not: null } }, select: { storageKey: true } });
  await prisma.team.deleteMany({ where: { id } });
  await removeStored(stored.map((photo) => photo.storageKey));
  revalidatePath("/", "layout");
  return ok();
}

/**
 * Test data in production: the made-up team "Swingkings Demo" (`src/lib/demo-team.ts`),
 * with the super admin as its admin. Pressed again, it is made afresh. Its players are
 * made up and cannot log in.
 */
export async function createDemoTeamAction(): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  await createDemoTeam({ joinUserId: user.id });
  revalidatePath("/", "layout");
  return ok("Testholdet er oprettet, og du er admin på det.");
}

/** Takes the test team and its made-up players away again; nothing else is touched. */
export async function removeDemoTeamAction(): Promise<ActionResult> {
  await requireSuperAdmin();
  const gone = await removeDemoTeam();
  revalidatePath("/", "layout");
  return ok(gone.teams ? "Testholdet og dets spillere er slettet." : "Der var intet testhold.");
}

/** A super admin looks into any team without joining it. */
export async function visitTeam(teamId: string) {
  const user = await requireSuperAdmin();
  await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: teamId } });
  revalidatePath("/", "layout");
  redirect("/oversigt");
}
