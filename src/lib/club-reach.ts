import type { NotificationCategory, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { announce } from "./realtime";
import { notify, type Notice } from "./notifications";

/**
 * What a team reaches beyond its own rows: the club posts and club activities shared with
 * it. A club's post or activity has no `teamId` — `teamDb` never finds it — and is shown to
 * each team in its `PostTeam` / `MatchTeam` rows, where everybody on those teams comments,
 * reacts, votes and signs up on the very same row.
 *
 * These queries cross teams on purpose, so they use `prisma`. Each is asked of one team id
 * (the action's, never "any team"), and answers only what that team's own rows and the
 * club rows shared with it hold: another team's own post is not found here either.
 */

/** A team's own posts, and the club posts shown to it. */
export function postsSeenBy(teamId: string): Prisma.PostWhereInput {
  return { OR: [{ teamId }, { teams: { some: { teamId } } }] };
}

/** A team's own activities, and the club activities shared with it. */
export function activitiesSeenBy(teamId: string): Prisma.MatchWhereInput {
  return { OR: [{ teamId }, { teams: { some: { teamId } } }] };
}

/** A team's own polls, and those on club posts shown to it. */
export function pollsSeenBy(teamId: string): Prisma.PollWhereInput {
  return { OR: [{ teamId }, { post: { teams: { some: { teamId } } } }] };
}

const SEEN_BY: Record<string, (teamId: string) => object> = {
  Match: activitiesSeenBy,
  Post: postsSeenBy,
  Poll: pollsSeenBy,
};

const READS = new Set(["findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);

/**
 * A read-only Prisma client for what one team sees of activities, posts and polls: its own,
 * and the club's shared with it. Every read carries the team's reach whether or not the
 * caller wrote it, as `teamDb` carries the team — so a page can list them without reaching
 * past the team. Writes, and every other model, are refused: those go through `teamDb`,
 * or are looked up here first and written by id.
 */
export function reachDb(teamId: string) {
  return prisma.$extends({
    name: "club-reach",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const seen = SEEN_BY[model];
          if (!seen) throw new Error(`reachDb reads activities, posts and polls; read ${model} through teamDb.`);
          if (!READS.has(operation)) throw new Error(`reachDb only reads; ${operation} on ${model} goes by id after a lookup here.`);
          const scoped = { ...(args as Record<string, unknown>) };
          scoped.where = { AND: [seen(teamId), (scoped.where as object | undefined) ?? {}] };
          return query(scoped);
        },
      },
    },
  });
}

/** One post the team sees, by id: "not found" (null) for anything else. */
export function findPostSeenBy<S extends Prisma.PostSelect>(teamId: string, id: string, select: S) {
  return prisma.post.findFirst({ where: { AND: [{ id }, postsSeenBy(teamId)] }, select });
}

/** One activity the team sees, by id: "not found" (null) for anything else. */
export function findActivitySeenBy<S extends Prisma.MatchSelect>(teamId: string, id: string, select: S) {
  return prisma.match.findFirst({ where: { AND: [{ id }, activitiesSeenBy(teamId)] }, select });
}

/** The teams a post or activity is on: its own team, or the teams a club shared it with. */
export function teamsOf(row: { teamId: string | null; teams?: { teamId: string }[] }): string[] {
  return row.teamId ? [row.teamId] : (row.teams ?? []).map((t) => t.teamId);
}

/** Read alongside a post or activity, for `teamsOf`. */
export const SHARED_WITH = { select: { teamId: true } } as const;

/** Tells every team the post or activity is on that it changed (`announce`). */
export function announceTo(teamIds: string[], event: string) {
  for (const teamId of new Set(teamIds)) announce(teamId, event);
}

/**
 * Each person's own team among `teamIds`: the first of them they joined. A notification is
 * one team's (`Notification.teamId`), so somebody on two of a club's teams hears of a club
 * post once, on that team. People on none of the teams are left out.
 */
export async function homeTeams(userIds: string[], teamIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0 || teamIds.length === 0) return new Map();
  const rows = await prisma.teamMember.findMany({
    where: { userId: { in: [...new Set(userIds)] }, teamId: { in: teamIds } },
    orderBy: [{ createdAt: "asc" }, { teamId: "asc" }],
    select: { userId: true, teamId: true },
  });
  const home = new Map<string, string>();
  for (const row of rows) if (!home.has(row.userId)) home.set(row.userId, row.teamId);
  return home;
}

/**
 * The same notice to people on any of `teamIds`, each once, on their own team among them
 * (`homeTeams`). For one team this is `notify`.
 */
export async function notifyAcross(teamIds: string[], userIds: string[], actorId: string | null, notice: Notice) {
  const home = await homeTeams(userIds, teamIds);
  const byTeam = new Map<string, string[]>();
  for (const [userId, teamId] of home) byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), userId]);
  for (const [teamId, people] of byTeam) await notify(teamId, people, actorId, notice);
}

/** Everybody on any of `teamIds`, each once. */
export async function everybodyOn(teamIds: string[]): Promise<string[]> {
  const rows = await prisma.teamMember.findMany({ where: { teamId: { in: teamIds } }, select: { userId: true } });
  return [...new Set(rows.map((row) => row.userId))];
}

/** Tells everybody on the teams something, each once, on their own team among them. */
export async function notifyEverybodyOn(teamIds: string[], actorId: string | null, notice: Notice & { category: NotificationCategory }) {
  await notifyAcross(teamIds, await everybodyOn(teamIds), actorId, notice);
}
