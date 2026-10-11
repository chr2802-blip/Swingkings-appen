/**
 * What the server and a phone agree on about a Realtime message, kept apart from
 * `realtime.ts` so the browser can import it without `node:crypto`.
 */
export function teamTopic(teamId: string) {
  return `team:${teamId}`;
}

/** A new chat message was posted. Carries only that something happened — never the text. */
export const CHAT_POSTED = "chat-posted";
