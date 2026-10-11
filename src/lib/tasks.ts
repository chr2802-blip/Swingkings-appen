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
        url: task.matchId ? `/kampe/${task.matchId}` : `/opgaver/${task.id}`,
        tag: `task-${task.id}`,
      },
    );
  }
  return tasks;
}

/** The team's standard match jobs, added to one match and handed out. */
export async function addTemplatesToMatch(
  teamId: string,
  match: { id: string; startsAt: Date },
  createdById: string | null,
) {
  const templates = await prisma.taskTemplate.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });
  return createDistributedTasks(
    teamId,
    templates.map((template) => ({
      title: template.title,
      description: template.description,
      matchId: match.id,
      dueAt: match.startsAt,
      people: template.people,
    })),
    createdById,
  );
}
