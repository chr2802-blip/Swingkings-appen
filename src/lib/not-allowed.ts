/**
 * The one error the app wants to say something specific about on screen: reaching a
 * record that belongs to another team. Next replaces a server error's message before it
 * reaches the browser, but keeps a `digest` the error brings with it — so that is the
 * signal the error boundary reads.
 */
export const NOT_ALLOWED_DIGEST = "SWINGKINGS_NOT_ALLOWED";

export class NotAllowedError extends Error {
  readonly digest = NOT_ALLOWED_DIGEST;

  constructor(message = "Not allowed") {
    super(message);
    this.name = "NotAllowedError";
  }
}

export function isNotAllowed(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { digest?: unknown }).digest === NOT_ALLOWED_DIGEST
  );
}
