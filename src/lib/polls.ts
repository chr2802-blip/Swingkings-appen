/**
 * Polls on the feed. Pure, so the rules are tested without a database.
 *
 * - A poll is open while nobody has closed it and its closing time (if any) has not passed.
 * - Single choice takes exactly one option; multiple choice one or more.
 * - An anonymous poll takes one ballot per person and it is final — the votes carry no
 *   voter, so there is nothing to change. An open poll can be re-voted until it closes.
 * - Results are shown to somebody who has voted, and to everybody once the poll closes,
 *   so the first votes do not steer the rest.
 */

/** At most this many answers, and this many pictures on one post. */
export const MAX_POLL_OPTIONS = 30;
export const MAX_POST_PHOTOS = 10;

export type PollState = { closedAt: Date | null; closesAt: Date | null };

export function isOpen(poll: PollState, now: Date = new Date()) {
  return poll.closedAt === null && (poll.closesAt === null || poll.closesAt > now);
}

export type VoteCheck = { ok: true; optionIds: string[] } | { ok: false; error: string };

/** Whether a ballot is one this poll can take now. */
export function checkVote(
  poll: PollState & { anonymous: boolean; multipleChoice: boolean; optionIds: string[] },
  chosen: string[],
  hasVoted: boolean,
  now: Date = new Date(),
): VoteCheck {
  if (!isOpen(poll, now)) return { ok: false, error: "Afstemningen er lukket." };
  if (poll.anonymous && hasVoted) return { ok: false, error: "Du har allerede stemt. En anonym stemme kan ikke ændres." };
  const unique = [...new Set(chosen)];
  if (unique.length === 0) return { ok: false, error: "Vælg et svar." };
  if (unique.some((id) => !poll.optionIds.includes(id))) return { ok: false, error: "Svaret findes ikke." };
  if (!poll.multipleChoice && unique.length > 1) return { ok: false, error: "Du kan kun vælge ét svar." };
  return { ok: true, optionIds: unique };
}

export type Tally = { optionId: string; votes: number; share: number; leading: boolean };

/**
 * Votes per option, each as a share of the ballots cast (so multiple-choice shares can
 * add up past 100 %), and which options lead. Nobody leads a poll with no votes.
 */
export function tally(optionIds: string[], votes: { optionId: string }[], ballots: number): Tally[] {
  const counts = new Map(optionIds.map((id) => [id, 0]));
  for (const vote of votes) counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  return optionIds.map((optionId) => {
    const n = counts.get(optionId) ?? 0;
    return { optionId, votes: n, share: ballots > 0 ? n / ballots : 0, leading: top > 0 && n === top };
  });
}

/** Cleans the typed answers: trimmed, blanks dropped, duplicates (ignoring case) dropped. */
export function cleanOptions(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const text of raw.map((t) => t.trim()).filter(Boolean)) {
    const key = text.toLocaleLowerCase("da");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text.slice(0, 200));
  }
  return result;
}
