/**
 * A chat message as it is quoted above an answer to it (as in Messenger): whose, the start
 * of its words on one line, and whether it had pictures. Read in the browser too, for the
 * quote above the box while the answer is written.
 */
export type ChatQuote = { id: string; authorName: string; body: string; photo: boolean };

/** A quoted message's words are cut to this many characters. */
export const QUOTE_LENGTH = 120;

export function quoteOf(message: { id: string; body: string; author: { name: string }; photos: unknown[] }): ChatQuote {
  const body = message.body.replace(/\s+/g, " ").trim();
  return {
    id: message.id,
    authorName: message.author.name,
    body: body.length > QUOTE_LENGTH ? `${body.slice(0, QUOTE_LENGTH - 1).trimEnd()}…` : body,
    photo: message.photos.length > 0,
  };
}
