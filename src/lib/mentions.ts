/**
 * Tagging a teammate in a comment: "@Bo" or "@Anna Hansen", written into the words
 * themselves. Nothing extra is stored — who is tagged is read from the words against
 * the team's roster, both when the comment is saved (to notify them) and when it is
 * shown (to make the name a link). A name only counts whole: "@Bob" does not tag Bo.
 */

export type MentionMember = { userId: string; name: string };

export type MentionSegment = { text: string; userId?: string };

/** At most this many names are offered while typing. */
export const MAX_SUGGESTIONS = 5;

const WORD = /[\p{L}\p{N}]/u;

/** The longest teammate whose name follows the "@" at `at`, as a whole word. */
function memberAt(body: string, at: number, members: MentionMember[]): MentionMember | null {
  const rest = body.slice(at + 1).toLocaleLowerCase("da");
  let best: MentionMember | null = null;
  for (const member of members) {
    const name = member.name.trim().toLocaleLowerCase("da");
    if (!name || !rest.startsWith(name)) continue;
    const next = rest.charAt(name.length);
    if (next && WORD.test(next)) continue;
    if (!best || name.length > best.name.trim().length) best = member;
  }
  return best;
}

/** An "@" starts a tag only at the beginning or after a space or punctuation, not in "a@b". */
function startsTag(body: string, at: number) {
  return body[at] === "@" && (at === 0 || !WORD.test(body.charAt(at - 1)));
}

/** The words cut into plain text and tagged names, in order. */
export function mentionSegments(body: string, members: MentionMember[]): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let plain = 0;
  for (let at = 0; at < body.length; at++) {
    if (!startsTag(body, at)) continue;
    const member = memberAt(body, at, members);
    if (!member) continue;
    const end = at + 1 + member.name.trim().length;
    if (at > plain) segments.push({ text: body.slice(plain, at) });
    segments.push({ text: body.slice(at, end), userId: member.userId });
    plain = end;
    at = end - 1;
  }
  if (plain < body.length) segments.push({ text: body.slice(plain) });
  return segments;
}

/** Everybody tagged in the words, each once, in the order they are first named. */
export function mentionedIds(body: string, members: MentionMember[]): string[] {
  const ids = mentionSegments(body, members).flatMap((s) => (s.userId ? [s.userId] : []));
  return [...new Set(ids)];
}

/**
 * The tag being typed just before the caret: where its "@" is and what follows it.
 * Names have spaces, so the query may too, but not a line break or a second "@".
 */
export function activeMention(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0 || !startsTag(value, start)) return null;
  const query = before.slice(start + 1);
  if (query.length > 40 || /[\n@]/.test(query) || query.startsWith(" ")) return null;
  return { start, query };
}

/** Teammates whose name, or a word of it, begins with the query; best matches first. */
export function suggestMembers<M extends MentionMember>(query: string, members: M[], excludeId?: string): M[] {
  // Not trimmed: "Anna " still offers "Anna Hansen" but no longer the "Anna" just chosen.
  const q = query.toLocaleLowerCase("da");
  const scored = members
    .filter((m) => m.userId !== excludeId)
    .map((m) => {
      const name = m.name.toLocaleLowerCase("da");
      const score = name.startsWith(q) ? 0 : name.split(/\s+/).some((word) => word.startsWith(q)) ? 1 : -1;
      return { m, score };
    })
    .filter((s) => s.score >= 0);
  scored.sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name, "da"));
  return scored.slice(0, MAX_SUGGESTIONS).map((s) => s.m);
}

/** The words with the tag being typed replaced by the chosen name, and where the caret goes. */
export function insertMention(value: string, start: number, caret: number, name: string): { value: string; caret: number } {
  const after = value.slice(caret);
  const inserted = `@${name.trim()}${after.startsWith(" ") ? "" : " "}`;
  return { value: value.slice(0, start) + inserted + after, caret: start + inserted.length + (after.startsWith(" ") ? 1 : 0) };
}
