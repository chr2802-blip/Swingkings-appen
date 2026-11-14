import { formatInZone } from "./time";

/**
 * A season, summed up when "Start ny sæson" ends it — before the fines, challenges and
 * finished activities behind it are deleted. Pure, so the sums are tested without a
 * database; `src/lib/season-data.ts` reads the rows and writes the result.
 *
 * Names are copied in: the people in a summary may since have left the team.
 */
export type SeasonSummary = {
  /** Fines given, not counting the pairs a challenge wrote. */
  fines: number;
  /** What the season's fines came to, challenges included (they move fines, they make none). */
  kr: number;
  /** The three who ended up owing most over the season, most first. */
  topFined: { name: string; units: number; kr: number }[];
  /** The fine given most often, if any were. */
  topReason: { reason: string; count: number } | null;
  /** Challenges approved. */
  challenges: number;
  topChallenger: { name: string; wins: number } | null;
  /** Jobs done. */
  tasks: number;
  topWorker: { name: string; tasks: number } | null;
  /** Activities that took place. */
  activities: number;
};

export type SeasonRows = {
  fines: { playerId: string; reason: string; units: number; unitPriceKr: number; challengeId: string | null }[];
  /** Winners of the approved challenges. */
  challengeWinners: string[];
  /** Jobs done. */
  tasksDone: number;
  /** One entry per person per job done: who was on it. */
  taskDoers: string[];
  activities: number;
  names: Map<string, string>;
};

const TOP = 3;

/** How often each value occurs, most first and by name on a tie, so a summary is stable. */
function ranked(values: string[], label: (value: string) => string) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "da"));
}

export function summarizeSeason(rows: SeasonRows): SeasonSummary {
  const nameOf = (id: string) => rows.names.get(id) ?? "Tidligere spiller";

  const perPlayer = new Map<string, { units: number; kr: number }>();
  let kr = 0;
  for (const fine of rows.fines) {
    const amount = fine.units * fine.unitPriceKr;
    kr += amount;
    const sum = perPlayer.get(fine.playerId) ?? { units: 0, kr: 0 };
    sum.units += fine.units;
    sum.kr += amount;
    perPlayer.set(fine.playerId, sum);
  }
  const topFined = [...perPlayer]
    .filter(([, sum]) => sum.kr > 0)
    .map(([id, sum]) => ({ name: nameOf(id), ...sum }))
    .sort((a, b) => b.kr - a.kr || a.name.localeCompare(b.name, "da"))
    .slice(0, TOP);

  const given = rows.fines.filter((fine) => !fine.challengeId);
  const reason = ranked(given.map((fine) => fine.reason), (r) => r)[0];
  const challenger = ranked(rows.challengeWinners, nameOf)[0];
  const worker = ranked(rows.taskDoers, nameOf)[0];

  return {
    fines: given.length,
    kr,
    topFined,
    topReason: reason ? { reason: reason.value, count: reason.count } : null,
    challenges: rows.challengeWinners.length,
    topChallenger: challenger ? { name: challenger.label, wins: challenger.count } : null,
    tasks: rows.tasksDone,
    topWorker: worker ? { name: worker.label, tasks: worker.count } : null,
    activities: rows.activities,
  };
}

/**
 * What to call the season that is ending, as the form suggests it: the year, or both
 * years when it ran across New Year ("2025/26").
 */
export function defaultSeasonName(startedAt: Date, now: Date = new Date()) {
  const from = Number(formatInZone(startedAt, "yyyy"));
  const to = Number(formatInZone(now, "yyyy"));
  return from >= to ? `Sæson ${to}` : `Sæson ${from}/${String(to).slice(-2)}`;
}

export const MAX_SEASON_NAME = 60;

/** Reads a stored summary back, tolerating a field a later version added. */
export function readSummary(value: unknown): SeasonSummary {
  const v = (value ?? {}) as Partial<SeasonSummary>;
  return {
    fines: v.fines ?? 0,
    kr: v.kr ?? 0,
    topFined: v.topFined ?? [],
    topReason: v.topReason ?? null,
    challenges: v.challenges ?? 0,
    topChallenger: v.topChallenger ?? null,
    tasks: v.tasks ?? 0,
    topWorker: v.topWorker ?? null,
    activities: v.activities ?? 0,
  };
}
