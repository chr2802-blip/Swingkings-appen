import { timingSafeEqual } from "crypto";

/**
 * Whether a request presents `CRON_SECRET` as its bearer token.
 *
 * The daily job (`/api/cron/daily`) will not run for anyone else.
 *
 * No secret configured is no admittance. A missing environment variable must not read
 * as "no password required" — that is how a deployment with the variable left unset
 * ends up with an open cron endpoint.
 */
export function presentsCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Compared byte for byte in constant time, and only once the lengths match:
  // timingSafeEqual throws on a mismatch rather than returning false.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
