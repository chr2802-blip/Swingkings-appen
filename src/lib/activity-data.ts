import { Prisma } from "@prisma/client";
import { teamDb } from "./team-db";
import { kickoffLabel, startOfDayInZone } from "./time";
import { activityName, readExternalSignups } from "./activity";

/**
 * Which activities belong in the everyday list: everything but trainings, plus any
 * training that has jobs on it. A team trains twice a week; the list would be nothing else.
 */
export const LISTED_ACTIVITY = {
  OR: [{ kind: { not: "TRAINING" } }, { tasks: { some: {} } }],
} satisfies Prisma.MatchWhereInput;

/**
 * Earlier activities that have jobs to copy, newest first, as options for "Kopiér
 * opgaver fra". Leaves out the one being copied to.
 */
export async function copyableActivities(teamId: string, exceptId?: string) {
  const rows = await teamDb(teamId).match.findMany({
    where: { tasks: { some: {} }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: { startsAt: "desc" },
    take: 40,
    select: { id: true, kind: true, title: true, opponent: true, startsAt: true, _count: { select: { tasks: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    label: `${activityName(row)} · ${kickoffLabel(row.startsAt)} (${row._count.tasks} ${row._count.tasks === 1 ? "opgave" : "opgaver"})`,
  }));
}

/** How many coming activities "Opret opgave" outside an activity offers. */
const UPCOMING_FOR_TASKS = 30;

/**
 * The activities a new job can be put on when it is made outside an activity (the "+" on a
 * person's page): from today on, soonest first. Every job belongs to one.
 */
export async function upcomingActivities(teamId: string, now: Date = new Date()) {
  const rows = await teamDb(teamId).match.findMany({
    where: { startsAt: { gte: startOfDayInZone(now) } },
    orderBy: { startsAt: "asc" },
    take: UPCOMING_FOR_TASKS,
    select: { id: true, kind: true, title: true, opponent: true, startsAt: true },
  });
  return rows.map((row) => ({ id: row.id, label: `${activityName(row)} · ${kickoffLabel(row.startsAt)}` }));
}

/** The team's standard jobs, as options to tick. */
export async function templateOptions(teamId: string) {
  return teamDb(teamId).taskTemplate.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, people: true, autoAdd: true },
  });
}

export type TemplateOption = Awaited<ReturnType<typeof templateOptions>>[number];
export type ActivityOption = { id: string; label: string };

/** How many of the latest KampKlar activities are read for the names KampKlar uses. */
const NAME_SOURCES = 40;

/**
 * Every name KampKlar has given in the sign-ups of the team's latest activities, in
 * alphabetical order: the choices when an admin links a member to their name there.
 */
export async function kampKlarNames(teamId: string): Promise<string[]> {
  const rows = await teamDb(teamId).match.findMany({
    where: { source: "KAMPKLAR", externalSignups: { not: Prisma.DbNull } },
    orderBy: { startsAt: "desc" },
    take: NAME_SOURCES,
    select: { externalSignups: true },
  });
  const names = new Set<string>();
  for (const row of rows) {
    const lists = readExternalSignups(row.externalSignups);
    if (lists) for (const name of [...lists.going, ...lists.notGoing]) names.add(name.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b, "da"));
}
