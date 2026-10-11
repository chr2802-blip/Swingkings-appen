/**
 * Handing out a team's jobs fairly. Pure: given who can take jobs and how many each has
 * had, it says who gets the next ones.
 *
 * "Fair" is: whoever has had the fewest jobs goes first. Ties are broken by who did one
 * longest ago (never is longest of all), then by a seeded shuffle, so a team of equals
 * does not always start with whoever sorts first alphabetically. Within one call a person
 * is picked once per job and counted as they are picked, so handing out five jobs spreads
 * them rather than giving all five to the one with the emptiest record.
 */
export type Candidate = {
  userId: string;
  /** Jobs this person has been given so far (the load being evened out). */
  load: number;
  /** When they were last given one, or null for never. */
  lastAssignedAt: Date | null;
};

/** A small deterministic generator, so the same seed hands out the same way (tests). */
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/**
 * Picks `people` distinct people for each job in `jobs`, in order. Returns one array of
 * user ids per job. A job wanting more people than there are candidates gets everybody.
 */
export function distribute(
  candidates: Candidate[],
  jobs: { people: number }[],
  seed: number = Date.now(),
): string[][] {
  const random = seeded(seed);
  const tiebreak = new Map(candidates.map((c) => [c.userId, random()]));
  const state = candidates.map((c) => ({ ...c }));
  let tick = Date.now();

  return jobs.map((job) => {
    const ordered = [...state].sort(
      (a, b) =>
        a.load - b.load ||
        (a.lastAssignedAt?.getTime() ?? -Infinity) - (b.lastAssignedAt?.getTime() ?? -Infinity) ||
        tiebreak.get(a.userId)! - tiebreak.get(b.userId)!,
    );
    const chosen = ordered.slice(0, Math.max(0, Math.min(job.people, ordered.length)));
    for (const person of chosen) {
      person.load += 1;
      // Strictly later than anything before, so the next job prefers somebody else.
      person.lastAssignedAt = new Date(++tick);
    }
    return chosen.map((person) => person.userId);
  });
}
