/**
 * The fine board read as a league table: everybody's place by what they owe, and how far
 * they have moved since a week ago (`STANDINGS_WEEK`). Who owes the same shares the place
 * (1, 2, 2, 4), as a table does on points.
 */
export const STANDINGS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Row = { userId: string; owesKr: number };

/** Places by `owesKr`, most first; equal sums share the higher place. */
export function places(rows: readonly Row[]) {
  const sorted = [...rows].sort((a, b) => b.owesKr - a.owesKr);
  const place = new Map<string, number>();
  sorted.forEach((row, index) => {
    const above = sorted[index - 1];
    place.set(row.userId, above && above.owesKr === row.owesKr ? place.get(above.userId)! : index + 1);
  });
  return place;
}

/**
 * Each row of `now` (kept in its order) with its place and its move: positive is up the
 * table (towards owing most), negative down, 0 standing still, and null for somebody who
 * was not on the table a week ago.
 */
export function standings<T extends Row>(now: readonly T[], weekAgo: readonly Row[]) {
  const current = places(now);
  const before = places(weekAgo);
  return now.map((row) => {
    const place = current.get(row.userId)!;
    const was = before.get(row.userId);
    return { ...row, place, move: was === undefined ? null : was - place };
  });
}
