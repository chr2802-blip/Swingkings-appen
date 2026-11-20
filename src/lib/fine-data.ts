import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { balances, fineKings } from "./money";
import { standings, STANDINGS_WEEK_MS } from "./standings";
import { teamRoster } from "./roster";
import { kickoffLabel, startOfMonthInZone } from "./time";

/**
 * What the fine pages all need: the price, the catalogue, the roster, what everyone owes and
 * whether the box is open for payment. `paid` is who the treasurer has marked paid: all or
 * nothing, so their fines still stand at what they came to.
 */
export async function fineBoard(teamId: string) {
  const db = teamDb(teamId);
  const [team, roster, fineTypes, fines] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { finePriceKr: true, mobilePayLink: true, duesKr: true, finePaymentOpenedAt: true } }),
    teamRoster(teamId),
    db.fineType.findMany({ where: { archivedAt: null }, orderBy: [{ units: "asc" }, { name: "asc" }] }),
    db.fine.findMany({ select: { playerId: true, units: true, unitPriceKr: true, createdAt: true } }),
  ]);
  const board = balances(
    roster.map((m) => m.userId),
    fines,
  );
  // The table as it stood a week ago, for the arrows beside each place.
  const weekAgo = new Date(Date.now() - STANDINGS_WEEK_MS);
  const before = balances(
    roster.map((m) => m.userId),
    fines.filter((fine) => fine.createdAt < weekAgo),
  );
  // Somebody who has left the team still owes what they owe, and still needs a name.
  const people = new Map<string, { name: string; photoId: string | null; shirtNumber: number | null; onTeam: boolean }>(
    roster.map((m) => [m.userId, { name: m.name, photoId: m.photoId, shirtNumber: m.shirtNumber, onTeam: true }]),
  );
  const gone = board.map((row) => row.userId).filter((id) => !people.has(id));
  if (gone.length) {
    const users = await prisma.user.findMany({ where: { id: { in: gone } }, select: { id: true, name: true, photoId: true } });
    for (const u of users) people.set(u.id, { name: u.name, photoId: u.photoId, shirtNumber: null, onTeam: false });
  }
  const paid = new Set(roster.filter((m) => m.finesPaid).map((m) => m.userId));
  // What is still to come into the box: everybody's fines, less those who have paid.
  const totalKr = board.reduce((sum, row) => sum + row.owesKr, 0);
  const missingKr = board.filter((row) => !paid.has(row.userId)).reduce((sum, row) => sum + row.owesKr, 0);
  return {
    finePriceKr: team.finePriceKr,
    payLink: team.mobilePayLink,
    duesKr: team.duesKr,
    paymentOpenedAt: team.finePaymentOpenedAt,
    roster,
    fineTypes,
    balances: board,
    /** `balances` in the same order, each with its place in the table and its move since a week ago. */
    standings: standings(board, before),
    paid,
    totalKr,
    missingKr,
    people,
  };
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

/** What a fine's row in a list shows: who, what for, how much, when — no more. */
const FINE_ROW = {
  id: true,
  reason: true,
  units: true,
  unitPriceKr: true,
  createdAt: true,
  challengeId: true,
  player: { select: { id: true, name: true, photoId: true } },
} as const;

/**
 * The team's newest fines — the history under the board and on its
 * own page, and (narrowed to one player or one activity) the fines on those pages, so a tap
 * opens the same sheet everywhere. Without `take`, all of them. Only what the rows show:
 * the rest is read when a sheet is opened (`fineDetails`).
 */
export function fineHistory(
  teamId: string,
  { take, playerId, matchId, id }: { take?: number; playerId?: string; matchId?: string; id?: string } = {},
) {
  return teamDb(teamId).fine.findMany({
    where: { id, playerId, matchId },
    orderBy: { createdAt: "desc" },
    take,
    select: FINE_ROW,
  });
}

/**
 * Everything about one fine, for its sheet (`loadFineDetails`): who gave it, the activity,
 * the note and the challenge it came from. Null if it is not this team's, or is gone.
 */
export function fineDetails(teamId: string, id: string) {
  return teamDb(teamId).fine.findFirst({
    where: { id },
    select: {
      ...FINE_ROW,
      issuedById: true,
      note: true,
      issuedBy: { select: { id: true, name: true } },
      match: { select: { opponent: true, title: true, startsAt: true } },
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

/** A challenge's row in a list: who won, who lost, what and the stake. Its sheet reads the rest. */
export const challengeRowSelect = {
  id: true,
  description: true,
  units: true,
  status: true,
  createdAt: true,
  winner: { select: { id: true, name: true, photoId: true } },
  loser: { select: { id: true, name: true, photoId: true } },
} as const;
