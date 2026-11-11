"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { assertTeamAdmin } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalId, optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { parseLocalDateTime } from "@/lib/time";
import { syncTeamCalendar } from "@/lib/kampklar";
import { addTemplatesToActivity, copyTasksFromActivity } from "@/lib/tasks";

function refresh() {
  revalidatePath("/aktiviteter", "layout");
  revalidatePath("/opgaver", "layout");
  revalidatePath("/oversigt");
}

/** The standard jobs ticked in a form, as repeated `templateId` fields. */
function pickedTemplates(formData: FormData) {
  return [...new Set(formData.getAll("templateId").map(String).filter(Boolean))];
}

const activitySchema = z.object({
  kind: z.enum(["MATCH", "TRAINING", "OTHER"]).default("MATCH"),
  title: optionalText,
  opponent: optionalText,
  startsAt: z.string().min(1, "Vælg tidspunkt for aktiviteten."),
  location: optionalText,
  venue: z.enum(["home", "away", "unknown"]).default("unknown"),
  note: optionalText,
  copyFromId: optionalId,
});

/**
 * An activity typed in by hand: a cup game or a friendly, an extra training, the
 * afslutningsfest. Activities from the feed are added by the sync. A new one can be
 * given standard jobs (the ticked templates) and the jobs of an earlier activity.
 */
export async function saveActivity(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(activitySchema, formData);
  if (!form.ok) return fail(form.error);
  const { kind, opponent } = form.fields;
  const startsAt = parseLocalDateTime(form.fields.startsAt);
  if (!startsAt) return fail("Tidspunktet kunne ikke læses.");

  let title: string;
  let isHome: boolean | null = null;
  if (kind === "MATCH") {
    if (!opponent) return fail("Skriv modstanderen.");
    if (opponent.length > 200) return fail("Teksten er for lang (højst 200 tegn).");
    isHome = form.fields.venue === "unknown" ? null : form.fields.venue === "home";
    title = isHome === false ? `${opponent} - ${user.teamName}` : `${user.teamName} - ${opponent}`;
  } else {
    title = form.fields.title ?? (kind === "TRAINING" ? "Træning" : "");
    if (!title) return fail("Giv aktiviteten et navn.");
    if (title.length > 200) return fail("Teksten er for lang (højst 200 tegn).");
  }
  const data = {
    kind,
    title,
    opponent: kind === "MATCH" ? opponent : null,
    startsAt,
    location: form.fields.location,
    isHome,
    note: form.fields.note,
  };

  const db = teamDb(user.teamId);
  const id = String(formData.get("id") ?? "");
  if (id) {
    const existing = await db.match.findFirst({ where: { id }, select: { source: true } });
    if (!existing) return fail("Aktiviteten findes ikke længere.");
    if (existing.source === "KAMPKLAR") return fail("Aktiviteten kommer fra KampKlar og rettes der.");
    await db.match.updateMany({ where: { id }, data });
    refresh();
    return ok();
  }

  if (form.fields.copyFromId) {
    const source = await db.match.findFirst({ where: { id: form.fields.copyFromId }, select: { id: true } });
    if (!source) return fail("Aktiviteten, der skulle kopieres opgaver fra, findes ikke.");
  }
  const activity = await db.match.create({
    data: { ...data, teamId: user.teamId, source: "MANUAL" },
    select: { id: true, startsAt: true },
  });
  await addTemplatesToActivity(user.teamId, activity, user.id, pickedTemplates(formData));
  if (form.fields.copyFromId) await copyTasksFromActivity(user.teamId, form.fields.copyFromId, activity, user.id);
  refresh();
  redirect(`/aktiviteter/${activity.id}`);
}

export async function deleteActivity(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const id = String(formData.get("id") ?? "");
  const db = teamDb(user.teamId);
  const activity = await db.match.findFirst({ where: { id }, select: { source: true } });
  if (!activity) return ok();
  if (activity.source === "KAMPKLAR") {
    return fail("Aktiviteten kommer fra KampKlar. Den forsvinder herfra, når den fjernes der.");
  }
  await db.match.deleteMany({ where: { id } });
  refresh();
  redirect("/aktiviteter");
}

export async function syncCalendar(): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const result = await syncTeamCalendar(user.teamId, user.id);
  if (!result.ok) return fail(result.error);
  refresh();
  const parts = [
    result.created && `${result.created} nye`,
    result.updated && `${result.updated} opdateret`,
    result.cancelled && `${result.cancelled} aflyst`,
    result.tasksAdded && `${result.tasksAdded} opgaver fordelt`,
  ].filter(Boolean);
  return ok(parts.length ? `Hentet fra KampKlar: ${parts.join(", ")}.` : "Alt er allerede opdateret.");
}

async function activityFrom(teamId: string, formData: FormData) {
  return teamDb(teamId).match.findFirst({
    where: { id: String(formData.get("activityId") ?? "") },
    select: { id: true, startsAt: true },
  });
}

/** Adds the ticked standard jobs to one activity and hands them out. */
export async function addStandardTasks(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const activity = await activityFrom(user.teamId, formData);
  if (!activity) return fail("Aktiviteten findes ikke.");
  const picked = pickedTemplates(formData);
  if (picked.length === 0) return fail("Vælg mindst én standardopgave.");
  const tasks = await addTemplatesToActivity(user.teamId, activity, user.id, picked);
  if (tasks.length === 0) return fail("Standardopgaverne findes ikke længere.");
  refresh();
  return ok(tasks.length === 1 ? "1 opgave er fordelt." : `${tasks.length} opgaver er fordelt.`);
}

/** Copies the jobs of an earlier activity onto this one and hands them out afresh. */
export async function copyTasks(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const activity = await activityFrom(user.teamId, formData);
  if (!activity) return fail("Aktiviteten findes ikke.");
  const fromId = String(formData.get("copyFromId") ?? "");
  if (!fromId) return fail("Vælg den aktivitet, opgaverne skal kopieres fra.");
  const tasks = await copyTasksFromActivity(user.teamId, fromId, activity, user.id);
  if (tasks.length === 0) return fail("Der var ingen opgaver at kopiere.");
  refresh();
  return ok(tasks.length === 1 ? "1 opgave er kopieret og fordelt." : `${tasks.length} opgaver er kopieret og fordelt.`);
}

const templateSchema = z.object({
  title: requiredText("Giv opgaven et navn."),
  description: optionalText,
  people: wholeNumber("Antal personer skal være mellem 1 og 20.", 1, 20),
});

export async function saveTaskTemplate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(templateSchema, formData);
  if (!form.ok) return fail(form.error);
  const data = { ...form.fields, autoAdd: formData.get("autoAdd") === "on" };
  const db = teamDb(user.teamId);
  const id = String(formData.get("id") ?? "");
  if (id) await db.taskTemplate.updateMany({ where: { id }, data });
  else await db.taskTemplate.create({ data: { ...data, teamId: user.teamId } });
  refresh();
  return ok();
}

export async function deleteTaskTemplate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  await teamDb(user.teamId).taskTemplate.deleteMany({ where: { id: String(formData.get("id") ?? "") } });
  refresh();
  return ok();
}
