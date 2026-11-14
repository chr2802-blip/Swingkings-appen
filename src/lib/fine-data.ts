import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { balances, fineKings } from "./money";
import { teamRoster } from "./roster";
import { kickoffLabel, startOfMonthInZone } from "./time";

/** What the fine pages all need: the price, the catalogue, the roster and what everyone owes. */
export async function fineBoard(teamId: string) {
  const db = teamDb(teamId);
  const [team, roster, fineTypes, fines] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { finePriceKr: true, mobilePayLink: true, duesKr: true } }),
    teamRoster(teamId),
    db.fineType.findMany({ where: { archivedAt: null }, orderBy: [{ units: "asc" }, { name: "asc" }] }),
    db.fine.findMany({ select: { playerId: true, units: true, unitPriceKr: true, clearedAt: true } }),
  ]);
  const board = balances(
    roster.map((m) => m.userId),
    fines,
  );
  // Somebody who has left the team still owes what they owe, and still needs a name.
  const people = new Map(roster.map((m) => [m.userId, { name: m.name, photoId: m.photoId, onTeam: true }]));
  const gone = board.map((row) => row.userId).filter((id) => !people.has(id));
  if (gone.length) {
    const users = await prisma.user.findMany({ where: { id: { in: gone } }, select: { id: true, name: true, photoId: true } });
    for (const u of users) people.set(u.id, { name: u.name, photoId: u.photoId, onTeam: false });
  }
  return { finePriceKr: team.finePriceKr, payLink: team.mobilePayLink, duesKr: team.duesKr, roster, fineTypes, balances: board, people };
}

/** Recent and upcoming matches, as a select's options. */
export async function matchOptions(teamId: string) {
  const now = Date.now();
  const matches = await teamDb(teamId).match.findMany({
    where: {
      kind: "MATCH",
      startsAt: { gte: new Date(now - 30 * 24 * 60 * 60 * 1000), lte: new Date(now + 60 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { startsAt: "desc" },
    select: { id: true, title: true, opponent: true, startsAt: true },
  });
  return matches.map((m) => ({ id: m.id, label: `${m.opponent ?? m.title} · ${kickoffLabel(m.startsAt)}` }));
}

/** This month's bødekonge(r), on the team's clock. */
export async function monthKings(teamId: string) {
  const fines = await teamDb(teamId).fine.findMany({
    where: { createdAt: { gte: startOfMonthInZone() } },
    select: { playerId: true, units: true, unitPriceKr: true },
  });
  return fineKings(fines);
}

/** The team's newest fines, cleared ones included — the history under the board and on its own page. */
export function fineHistory(teamId: string, take: number) {
  return teamDb(teamId).fine.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      reason: true,
      units: true,
      unitPriceKr: true,
      createdAt: true,
      challengeId: true,
      clearedAt: true,
      issuedById: true,
      note: true,
      player: { select: { id: true, name: true, photoId: true } },
      issuedBy: { select: { id: true, name: true } },
      match: { select: { opponent: true, title: true, startsAt: true } },
      // What the history's sheet shows about the challenge a fine came from.
      challenge: {
        select: {
          id: true,
          description: true,
          units: true,
          status: true,
          createdAt: true,
          reportedById: true,
          winner: { select: { id: true, name: true, photoId: true } },
          loser: { select: { id: true, name: true, photoId: true } },
          reportedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          match: { select: { opponent: true, title: true } },
        },
      },
    },
  });
}
