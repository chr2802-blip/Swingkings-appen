"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { assertTeamAdmin } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { parseLocalDateTime } from "@/lib/time";
import { syncTeamCalendar } from "@/lib/kampklar";
import { addTemplatesToMatch } from "@/lib/tasks";

function refresh() {
  revalidatePath("/kampe", "layout");
  revalidatePath("/opgaver");
  revalidatePath("/oversigt");
}

const matchSchema = z.object({
  opponent: requiredText("Skriv modstanderen."),
  startsAt: z.string().min(1, "Vælg tidspunkt for kampen."),
  location: optionalText,
  venue: z.enum(["home", "away", "unknown"]).default("unknown"),
  note: optionalText,
  addTemplates: z.string().optional(),
});

/**
 * A match typed in by hand — for a cup game, a friendly, or a team whose KampKlar link
 * is not set up. Matches from the feed are added by the sync.
 */
export async function saveMatch(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(matchSchema, formData);
  if (!form.ok) return fail(form.error);
  const startsAt = parseLocalDateTime(form.fields.startsAt);
  if (!startsAt) return fail("Tidspunktet kunne ikke læses.");
  const isHome = form.fields.venue === "unknown" ? null : form.fields.venue === "home";
  const data = {
    opponent: form.fields.opponent,
    title: isHome === false ? `${form.fields.opponent} - ${user.teamName}` : `${user.teamName} - ${form.fields.opponent}`,
    startsAt,
    location: form.fields.location,
    isHome,
    note: form.fields.note,
  };
  const db = teamDb(user.teamId);
  const id = String(formData.get("id") ?? "");
  if (id) {
    const existing = await db.match.findFirst({ where: { id }, select: { source: true } });
    if (!existing) return fail("Kampen findes ikke længere.");
    if (existing.source === "KAMPKLAR") return fail("Kampen kommer fra KampKlar og rettes der.");
    await db.match.updateMany({ where: { id }, data });
    refresh();
    return ok();
  }
  const match = await db.match.create({ data: { ...data, teamId: user.teamId, kind: "MATCH", source: "MANUAL" } });
  if (form.fields.addTemplates === "on") await addTemplatesToMatch(user.teamId, match, user.id);
  refresh();
  redirect(`/kampe/${match.id}`);
}

export async function deleteMatch(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const id = String(formData.get("id") ?? "");
  const db = teamDb(user.teamId);
  const match = await db.match.findFirst({ where: { id }, select: { source: true } });
  if (!match) return ok();
  if (match.source === "KAMPKLAR") return fail("Kampen kommer fra KampKlar. Den forsvinder herfra, når den fjernes der.");
  await db.match.deleteMany({ where: { id } });
  refresh();
  redirect("/kampe");
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

/** Adds the team's standard jobs to one match and hands them out. */
export async function addStandardTasks(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const match = await teamDb(user.teamId).match.findFirst({
    where: { id: String(formData.get("matchId") ?? "") },
    select: { id: true, startsAt: true },
  });
  if (!match) return fail("Kampen findes ikke.");
  const tasks = await addTemplatesToMatch(user.teamId, match, user.id);
  if (tasks.length === 0) return fail("Holdet har ingen standardopgaver endnu. Opret dem under Opgaver → Standardopgaver.");
  refresh();
  return ok(`${tasks.length} opgaver er fordelt.`);
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
  const db = teamDb(user.teamId);
  const id = String(formData.get("id") ?? "");
  if (id) await db.taskTemplate.updateMany({ where: { id }, data: form.fields });
  else await db.taskTemplate.create({ data: { ...form.fields, teamId: user.teamId } });
  revalidatePath("/opgaver", "layout");
  return ok();
}

export async function deleteTaskTemplate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  await teamDb(user.teamId).taskTemplate.deleteMany({ where: { id: String(formData.get("id") ?? "") } });
  revalidatePath("/opgaver", "layout");
  return ok();
}
