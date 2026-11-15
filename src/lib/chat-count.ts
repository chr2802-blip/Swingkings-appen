/**
 * What the server and the header's chat button agree on about the unread count, kept
 * apart from `chat.ts` so the browser can import it without the database.
 */

/** The most unread messages the chat button counts; past it, it says "99+". */
export const UNREAD_UP_TO = 100;

/** The badge's text: the count, or "99+" once it is counted no further. */
export function unreadLabel(unread: number) {
  return unread >= UNREAD_UP_TO ? `${UNREAD_UP_TO - 1}+` : String(unread);
}
