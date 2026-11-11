import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { distribute, type Candidate } from "./distribution";
import { notifyLater } from "./notify";

/** "Still to do" as a where clause. Every query meaning that uses it. */
export const OPEN_TASK = { doneAt: null } satisfies Prisma.TaskWhereInput;
export const DONE_TASK = { doneAt: { not: null } } satisfies Prisma.TaskWhereInput;

/** How far back a job counts towards somebody's share: one season and a bit. */
const LOAD_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Everybody on the team the distribution may pick, with how many jobs each has had in
 * the window and when they last got one.
 *
 * Reads `TaskAssignee` through `prisma` with the team named in the relation filter:
 * assignees carry no `teamId` of their own, so `teamDb` refuses them.
 */
export async function taskCandidates(teamId: string, now: Date = new Date()): Promise<Candidate[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId, takesTasks: true },
    select: { userId: true },
  });
  const since = new Date(now.getTime() - LOAD_WINDOW_MS);
  const loads = await prisma.taskAssignee.groupBy({
    by: ["userId"],
    where: { userId: { in: members.map((m) => m.userId) }, task: { teamId, createdAt: { gte: since } } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const byUser = new Map(loads.map((row) => [row.userId, row]));
  return members.map(({ userId }) => ({
    userId,
    load: byUser.get(userId)?._count._all ?? 0,
    lastAssignedAt: byUser.get(userId)?._max.createdAt ?? null,
  }));
}

export type Job = {
  title: string;
  description: string | null;
  matchId: string | null;
  dueAt: Date | null;
  /** How many people to hand it to. 0 leaves it unassigned for somebody to take. */
  people: number;
};

/** Creates the jobs and hands each one out fairly. Returns the tasks with who got them. */
export async function createDistributedTasks(teamId: string, jobs: Job[], createdById: string | null) {
  if (jobs.length === 0) return [];
  const picks = distribute(await taskCandidates(teamId), jobs);
  const tasks = await prisma.$transaction(
    jobs.map((job, index) =>
      prisma.task.create({
        data: {
          teamId,
          title: job.title,
          description: job.description,
          matchId: job.matchId,
          dueAt: job.dueAt,
          createdById,
          assignees: { create: picks[index]!.map((userId) => ({ userId })) },
        },
        select: { id: true, title: true, matchId: true, assignees: { select: { userId: true } } },
      }),
    ),
  );
  // Everybody hears about the job they were handed, except whoever handed it out.
  for (const task of tasks) {
    notifyLater(
      task.assignees.map((a) => a.userId),
      createdById,
      {
        title: `Ny opgave: ${task.title}`,
        body: "Du er blevet valgt til en opgave på holdet.",
        url: taskUrl(task),
        tag: `task-${task.id}`,
      },
    );
  }
  return tasks;
}

export type ActivityRef = { id: string; startsAt: Date };

/** Where a job about an activity is opened from: the activity's page. */
export function taskUrl(task: { id: string; matchId: string | null }) {
  return task.matchId ? `/aktiviteter/${task.matchId}` : `/opgaver/${task.id}`;
}

/**
 * The team's standard jobs, added to one activity and handed out. `which` picks them:
 * a list of template ids (anything not the team's is ignored, being read through the
 * team), or "auto" for the ones the KampKlar sync adds by itself.
 */
export async function addTemplatesToActivity(
  teamId: string,
  activity: ActivityRef,
  createdById: string | null,
  which: string[] | "auto",
) {
  if (Array.isArray(which) && which.length === 0) return [];
  const templates = await prisma.taskTemplate.findMany({
    where: { teamId, ...(which === "auto" ? { autoAdd: true } : { id: { in: which } }) },
    orderBy: { createdAt: "asc" },
  });
  return createDistributedTasks(
    teamId,
    templates.map((template) => ({
      title: template.title,
      description: template.description,
      matchId: activity.id,
      dueAt: activity.startsAt,
      people: template.people,
    })),
    createdById,
  );
}

/**
 * Copies another activity's jobs onto this one — "the same as last year's
 * afslutningsfest". Each copy goes to as many people as the original had (at least one),
 * chosen afresh by the fair distribution, and keeps its deadline's distance from the
 * start: due two days before then is due two days before now. Who did what, and whether
 * it was done, is not copied. `fromId` is looked up on the team, so another team's
 * activity copies nothing.
 */
export async function copyTasksFromActivity(
  teamId: string,
  fromId: string,
  to: ActivityRef,
  createdById: string | null,
) {
  if (fromId === to.id) return [];
  const source = await prisma.match.findFirst({
    where: { id: fromId, teamId },
    select: {
      startsAt: true,
      tasks: {
        orderBy: { createdAt: "asc" },
        select: { title: true, description: true, dueAt: true, _count: { select: { assignees: true } } },
      },
    },
  });
  if (!source) return [];
  return createDistributedTasks(
    teamId,
    source.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      matchId: to.id,
      dueAt: task.dueAt ? new Date(to.startsAt.getTime() + (task.dueAt.getTime() - source.startsAt.getTime())) : to.startsAt,
      people: Math.max(1, task._count.assignees),
    })),
    createdById,
  );
}
