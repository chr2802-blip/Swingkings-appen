import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { balances } from "./money";
import { teamRoster } from "./roster";
import { kickoffLabel } from "./time";

/** What the fine pages all need: the price, the catalogue, the roster and everyone's account. */
export async function fineBoard(teamId: string) {
  const db = teamDb(teamId);
  const [team, roster, fineTypes, fines, payments] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { finePriceKr: true } }),
    teamRoster(teamId),
    db.fineType.findMany({ where: { archivedAt: null }, orderBy: [{ units: "asc" }, { name: "asc" }] }),
    db.fine.findMany({ select: { playerId: true, units: true, unitPriceKr: true } }),
    db.payment.findMany({ select: { playerId: true, amountKr: true } }),
  ]);
  const board = balances(
    roster.map((m) => m.userId),
    fines,
    payments,
  );
  // Somebody who has left the team still owes what they owe, and still needs a name.
  const people = new Map(roster.map((m) => [m.userId, { name: m.name, photoId: m.photoId, onTeam: true }]));
  const gone = board.map((row) => row.userId).filter((id) => !people.has(id));
  if (gone.length) {
    const users = await prisma.user.findMany({ where: { id: { in: gone } }, select: { id: true, name: true, photoId: true } });
    for (const u of users) people.set(u.id, { name: u.name, photoId: u.photoId, onTeam: false });
  }
  return { finePriceKr: team.finePriceKr, roster, fineTypes, balances: board, people };
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
