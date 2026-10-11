import { teamDb } from "./team-db";
import { kickoffLabel } from "./time";

/** Upcoming matches (and the last week's), as the options a task or fine is tied to. */
export async function upcomingMatchOptions(teamId: string) {
  const matches = await teamDb(teamId).match.findMany({
    where: {
      kind: "MATCH",
      cancelledAt: null,
      startsAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { startsAt: "asc" },
    take: 40,
    select: { id: true, title: true, opponent: true, startsAt: true },
  });
  return matches.map((m) => ({ id: m.id, label: `${m.opponent ?? m.title} · ${kickoffLabel(m.startsAt)}` }));
}
