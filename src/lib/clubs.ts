import { prisma } from "./prisma";

/**
 * Clubs (klubber): several teams under one roof, looked after by club admins who write
 * club posts and make club activities for the teams they choose (`src/lib/club-reach.ts`).
 * The super admin makes a club, puts teams in it and names its admins. A club is above
 * the teams, so everything here reads with `prisma`.
 */

export const MAX_CLUB_NAME = 80;

/** The club a team is part of, or null. */
export async function clubOfTeam(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { club: { select: { id: true, name: true } } } });
  return team?.club ?? null;
}

/** The club's teams, by name: the choices when something is shared with them. */
export function clubTeams(clubId: string) {
  return prisma.team.findMany({ where: { clubId }, orderBy: { name: "asc" }, select: { id: true, name: true, photoId: true } });
}

/**
 * The teams chosen in a form (`teamId`, repeated), each one of the club's — or null when
 * one is not, or none was chosen.
 */
export async function chosenClubTeams(clubId: string, formData: FormData): Promise<string[] | null> {
  const chosen = [...new Set(formData.getAll("teamId").map(String).filter(Boolean))];
  if (chosen.length === 0) return null;
  const found = await prisma.team.count({ where: { clubId, id: { in: chosen } } });
  return found === chosen.length ? chosen : null;
}

/**
 * Ends the club admin role of anybody no longer playing on one of the club's teams — they
 * left the team, it left the club, or it was deleted. A club admin is always a player too.
 */
export async function pruneClubAdmins(clubId?: string | null) {
  const clubs = clubId ? [{ id: clubId }] : await prisma.club.findMany({ select: { id: true } });
  for (const club of clubs) {
    await prisma.clubAdmin.deleteMany({
      where: { clubId: club.id, user: { memberships: { none: { team: { clubId: club.id } } } } },
    });
  }
}

/**
 * Puts a team in a club, moves it to another or takes it out (`clubId` null). Leaving a
 * club, the team stops seeing its posts and activities: their sharing with the team goes,
 * and with it the team's own sign-ups, comments and jobs on those activities.
 */
export async function setTeamClub(teamId: string, clubId: string | null) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { clubId: true } });
  if (!team || team.clubId === clubId) return;
  const left = team.clubId;
  await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { clubId } });
    if (!left) return;
    await tx.postTeam.deleteMany({ where: { teamId, post: { clubId: left } } });
    const shared = { clubId: left };
    await tx.matchTeam.deleteMany({ where: { teamId, match: shared } });
    await tx.activitySignup.deleteMany({ where: { teamId, match: shared } });
    await tx.activityComment.deleteMany({ where: { teamId, match: shared } });
    await tx.task.deleteMany({ where: { teamId, match: shared } });
  });
  if (left) await pruneClubAdmins(left);
}

/**
 * Takes a club activity away from teams it was shared with: it is gone from them, and so
 * are their sign-ups, comments and jobs on it.
 */
export async function unshareActivity(matchId: string, teamIds: string[]) {
  if (teamIds.length === 0) return;
  const where = { matchId, teamId: { in: teamIds } };
  await prisma.$transaction([
    prisma.matchTeam.deleteMany({ where }),
    prisma.activitySignup.deleteMany({ where }),
    prisma.activityComment.deleteMany({ where }),
    prisma.task.deleteMany({ where }),
  ]);
}

/** Everything about the clubs for the super admin's page. */
export function allClubs() {
  return prisma.club.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      teams: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      admins: { orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
}

/** Who can be made a club admin: everybody on one of the club's teams, by name, each once. */
export async function clubPlayers(clubId: string) {
  const rows = await prisma.user.findMany({
    where: { memberships: { some: { team: { clubId } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return rows;
}

/**
 * Everybody on the teams, for a club activity's sign-ups: each person once with the team
 * they are listed under (the first of them they joined) and its name.
 */
export async function rosterAcross(teamIds: string[]) {
  const rows = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } },
    orderBy: [{ createdAt: "asc" }, { teamId: "asc" }],
    select: { userId: true, shirtNumber: true, team: { select: { id: true, name: true } }, user: { select: { name: true, photoId: true } } },
  });
  const people = new Map<string, { userId: string; name: string; photoId: string | null; shirtNumber: number | null; teamId: string; teamName: string }>();
  for (const row of rows) {
    if (people.has(row.userId)) continue;
    people.set(row.userId, {
      userId: row.userId,
      name: row.user.name,
      photoId: row.user.photoId,
      shirtNumber: row.shirtNumber,
      teamId: row.team.id,
      teamName: row.team.name,
    });
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "da"));
}

/** The club's coming activities, soonest first, for its admins' page. */
export function upcomingClubActivities(clubId: string, from: Date) {
  return prisma.match.findMany({
    where: { clubId, startsAt: { gte: from } },
    orderBy: { startsAt: "asc" },
    take: 30,
    select: {
      id: true,
      title: true,
      startsAt: true,
      cancelledAt: true,
      _count: { select: { teams: true } },
      signups: { where: { going: true }, select: { userId: true } },
    },
  });
}

/** The club's latest posts, for its admins' page. */
export function latestClubPosts(clubId: string) {
  return prisma.post.findMany({
    where: { clubId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
      poll: { select: { question: true } },
      _count: { select: { teams: true, comments: true, photos: true } },
    },
  });
}

/** The club's admins, first named first. */
export function clubAdmins(clubId: string) {
  return prisma.clubAdmin.findMany({ where: { clubId }, orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, name: true } } } });
}
