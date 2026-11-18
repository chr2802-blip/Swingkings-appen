import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { balances } from "./money";
import { openTask } from "./tasks";
import { readSummary, summarizeSeason, type SeasonSummary } from "./season";

/**
 * "Start ny sæson": the season's summary is kept, and what it was made from goes —
 * every fine and challenge (the box has been paid, so nothing is carried over), the
 * activities that have taken place with their jobs and sign-ups, the jobs done that
 * belonged to no activity, the invitation links, and everybody's kontingent and paid
 * marks; the box closes for payment again. The
 * KampKlar sync brings nothing back from before the new season (`applyCalendar`).
 *
 * Kept: upcoming activities and their jobs, open jobs, members, roles, the catalogue,
 * standard jobs, the feed and the chat.
 */

/** When the season now running began: the last "Start ny sæson", or the team's creation. */
export async function seasonStart(teamId: string) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { seasonStartedAt: true, createdAt: true } });
  return team.seasonStartedAt ?? team.createdAt;
}

/** What the season page shows before anybody presses: what would go, and what has not been paid. */
export async function seasonPreview(teamId: string, now: Date = new Date()) {
  const db = teamDb(teamId);
  const [startedAt, members, fines, challenges, activities, links] = await Promise.all([
    seasonStart(teamId),
    db.teamMember.findMany({ select: { userId: true, duesPaidAt: true, finesPaidAt: true } }),
    db.fine.findMany({ select: { playerId: true, units: true, unitPriceKr: true } }),
    db.challenge.count(),
    db.match.count({ where: { startsAt: { lt: now } } }),
    db.inviteLink.count(),
  ]);
  // Everybody with fines who has not been marked paid, members or not.
  const paid = new Set(members.filter((m) => m.finesPaidAt).map((m) => m.userId));
  const owing = balances([], fines).filter((row) => row.owesKr > 0 && !paid.has(row.userId));
  return {
    startedAt,
    fines: fines.length,
    challenges,
    activities,
    links,
    members: members.length,
    duesPaid: members.filter((m) => m.duesPaidAt).length,
    owingPlayers: owing.length,
    owingKr: owing.reduce((sum, row) => sum + row.owesKr, 0),
  };
}

/** Reads the season's rows and sums them up. Inside the transaction, so it sums what is deleted. */
async function gatherSummary(tx: Tx, teamId: string, now: Date): Promise<SeasonSummary> {
  const [fines, settled, doneTasks, activities] = await Promise.all([
    tx.fine.findMany({ where: { teamId }, select: { playerId: true, reason: true, units: true, unitPriceKr: true, challengeId: true } }),
    tx.challenge.findMany({ where: { teamId, status: "SETTLED" }, select: { winnerId: true } }),
    tx.task.findMany({ where: { teamId, NOT: openTask(now) }, select: { id: true } }),
    tx.match.count({ where: { teamId, startsAt: { lt: now }, cancelledAt: null } }),
  ]);
  // Assignees carry no teamId; they are reached through the team's own tasks, read above.
  const doers = await tx.taskAssignee.findMany({
    where: { taskId: { in: doneTasks.map((task) => task.id) } },
    select: { userId: true },
  });
  const ids = [...new Set([...fines.map((f) => f.playerId), ...settled.map((c) => c.winnerId), ...doers.map((d) => d.userId)])];
  // Names of people who may have left the team: users are on several teams, so asked directly.
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return summarizeSeason({
    fines,
    challengeWinners: settled.map((c) => c.winnerId),
    tasksDone: doneTasks.length,
    taskDoers: doers.map((d) => d.userId),
    activities,
    names: new Map(users.map((u) => [u.id, u.name])),
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type StartSeasonResult = { ok: true; seasonId: string } | { ok: false; error: string };

/**
 * Ends the running season and starts the next, all or nothing. Guarded on the start it
 * read, so two presses at once end it once: the second finds it already moved on.
 *
 * Plain `prisma` with the team's id written on every query: an interactive transaction
 * cannot carry `teamDb`'s scoping, so each clause below says `teamId` itself, and
 * `tests/integration/season.test.ts` checks another team is left whole.
 */
export async function startSeason(teamId: string, name: string, now: Date = new Date()): Promise<StartSeasonResult> {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { seasonStartedAt: true, createdAt: true } });
  const startedAt = team.seasonStartedAt ?? team.createdAt;

  return prisma.$transaction(async (tx) => {
    const moved = await tx.team.updateMany({
      where: { id: teamId, seasonStartedAt: team.seasonStartedAt },
      data: { seasonStartedAt: now, finePaymentOpenedAt: null },
    });
    if (moved.count === 0) return { ok: false as const, error: "Den nye sæson er allerede startet." };

    const summary = await gatherSummary(tx, teamId, now);
    const season = await tx.season.create({
      data: { teamId, name, startedAt, endedAt: now, summary },
      select: { id: true },
    });

    await tx.fine.deleteMany({ where: { teamId } });
    await tx.challenge.deleteMany({ where: { teamId } });
    // What the center said about them goes too: the fines it named and the money asked for.
    await tx.notification.deleteMany({ where: { teamId, category: { in: ["FINES", "CHALLENGES"] } } });
    // Jobs and sign-ups go with their activity (onDelete: Cascade).
    await tx.match.deleteMany({ where: { teamId, startsAt: { lt: now } } });
    await tx.task.deleteMany({ where: { teamId, matchId: null, NOT: openTask(now) } });
    await tx.inviteLink.deleteMany({ where: { teamId } });
    await tx.teamMember.updateMany({ where: { teamId }, data: { duesPaidAt: null, finesPaidAt: null } });
    return { ok: true as const, seasonId: season.id };
  });
}

/** The team's ended seasons, the latest first. */
export async function teamSeasons(teamId: string) {
  const rows = await teamDb(teamId).season.findMany({ orderBy: { endedAt: "desc" } });
  return rows.map((row) => ({ ...row, summary: readSummary(row.summary) }));
}
