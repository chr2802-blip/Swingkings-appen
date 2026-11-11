import type { Prisma } from "@prisma/client";
import { teamDb } from "./team-db";
import { kickoffLabel } from "./time";
import { activityName } from "./activity";

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

/** The team's standard jobs, as options to tick. */
export async function templateOptions(teamId: string) {
  return teamDb(teamId).taskTemplate.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, people: true, autoAdd: true },
  });
}

export type TemplateOption = Awaited<ReturnType<typeof templateOptions>>[number];
export type ActivityOption = { id: string; label: string };
