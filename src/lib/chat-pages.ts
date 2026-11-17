import type { ChatItem, ChatPage } from "./chat";

/**
 * What the open chat shows after a poll: the latest page in place of the newest messages on
 * screen, with the older pages that were scrolled up to kept in front of it. When the latest
 * page no longer meets what is on screen (more than a page came in at once, or its first
 * message was not shown), the older pages are dropped rather than leave a hole between them.
 */
export function withLatest(shown: ChatPage, latest: ChatPage): ChatPage {
  const first = latest.messages[0];
  const at = first ? shown.messages.findIndex((message) => message.id === first.id) : -1;
  if (at <= 0) return latest;
  return { messages: [...shown.messages.slice(0, at), ...latest.messages], more: shown.more };
}

/** An older page put in front of what is on screen, leaving out any message already shown. */
export function withOlder(shown: ChatPage, older: ChatPage): ChatPage {
  const onScreen = new Set(shown.messages.map((message) => message.id));
  return { messages: [...older.messages.filter((message) => !onScreen.has(message.id)), ...shown.messages], more: older.more };
}

/** A message taken off the screen at once, as its author or an admin deletes it. */
export function without(shown: ChatPage, id: string): ChatPage {
  return { ...shown, messages: shown.messages.filter((message: ChatItem) => message.id !== id) };
}
