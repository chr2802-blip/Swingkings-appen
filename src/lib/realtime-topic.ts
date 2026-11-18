/**
 * What the server and a phone agree on about a Realtime message, kept apart from
 * `realtime.ts` so the browser can import it without `node:crypto`.
 */
export function teamTopic(teamId: string) {
  return `team:${teamId}`;
}

/** A new chat message was posted. Carries only that something happened — never the text. */
export const CHAT_POSTED = "chat-posted";

/** Somebody on the team got a notification; each phone asks for its own count. Never says whom. */
export const NOTIFIED = "notified";

/** Something on the feed changed (a post, a comment, a like, a vote, a pin). Pages showing it read themselves again. */
export const FEED_CHANGED = "feed-changed";

/** Something in the fine box changed (a fine, a challenge, the catalogue, payment). Pages showing it read themselves again. */
export const FINES_CHANGED = "fines-changed";
