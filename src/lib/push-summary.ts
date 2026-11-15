/**
 * The rules and the wording of grouped notifications — the team chat and the comments on
 * one's own post — so a lively evening does not buzz anybody's phone every minute.
 *
 * - A person gets one full push for a thread. For the next `PUSH_PAUSE_MS` after it,
 *   further messages only update that notification quietly ("7 nye beskeder"), unless
 *   they have opened the thread since.
 * - Nothing is sent to somebody who has the thread open right now (`ACTIVE_MS`).
 * - The notification says how many there are and from whom, never one push per message.
 */

export const PUSH_PAUSE_MS = 10 * 60 * 1000;

/** Seen this recently means it is open in front of them. Longer than the open chat's slowest poll. */
export const ACTIVE_MS = 60 * 1000;

export type Unread = { authorName: string; text: string };

/** Whether somebody looking at the thread this recently has it open now. */
export function isActive(seenAt: Date | null, now: Date) {
  return seenAt !== null && now.getTime() - seenAt.getTime() < ACTIVE_MS;
}

/** The latest of several "read up to" moments. */
export function latest(...moments: (Date | null | undefined)[]): Date {
  return new Date(Math.max(0, ...moments.map((m) => m?.getTime() ?? 0)));
}

/** "Anna", "Anna og Bo", "Anna, Bo og Carl", "Anna, Bo og 3 andre" — newest writer first. */
export function whoText(names: string[]) {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "";
  if (unique.length <= 3) return `${unique.slice(0, -1).join(", ")} og ${unique.at(-1)}`;
  return `${unique.slice(0, 2).join(", ")} og ${unique.length - 2} andre`;
}

const snippet = (text: string) => (text.length > 140 ? `${text.slice(0, 139)}…` : text);
const count = (n: number) => (n > 99 ? "99+" : String(n));

/** Newest first, as the notification reads them. */
function byNewest(unread: Unread[]) {
  return [...unread].reverse();
}

/** The team chat's notification for one person, from what they have not read (oldest first). */
export function chatSummary(teamName: string, unread: Unread[]) {
  const last = unread.at(-1)!;
  if (unread.length === 1) return { title: `${last.authorName} · ${teamName}`, body: snippet(last.text) };
  return {
    title: `${teamName} · ${count(unread.length)} nye beskeder`,
    body: `${whoText(byNewest(unread).map((u) => u.authorName))}\n${last.authorName}: ${snippet(last.text)}`,
  };
}

/** The comments on one's own post, from what they have not read (oldest first). */
export function commentSummary(unread: Unread[]) {
  const last = unread.at(-1)!;
  if (unread.length === 1) return { title: `${last.authorName} kommenterede dit opslag`, body: snippet(last.text) };
  return {
    title: `${count(unread.length)} nye kommentarer på dit opslag`,
    body: `${whoText(byNewest(unread).map((u) => u.authorName))}\n${last.authorName}: ${snippet(last.text)}`,
  };
}

/** What a chat message says in a notification when it is only pictures. */
export function chatText(body: string, photoCount: number) {
  if (body) return body;
  return photoCount === 1 ? "📷 Sendte et billede" : `📷 Sendte ${photoCount} billeder`;
}
