import { createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "./prisma";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * How many attempts a scope allows in its window (`WINDOW_MS`, else a quarter of an
 * hour). Eight is the guess-a-password number, and is right for anything guarding a secret.
 *
 * `photo` counts pictures uploaded — the one write here that weighs up to a megabyte and
 * a half, stored in Postgres. Sixty in a quarter of an hour is a whole match's photos;
 * nothing short of a loop goes past it. `chat` counts messages sent: a lively thread is
 * a few a minute, so 120 is only reached by something that is not a person typing.
 *
 * `signup` counts accounts created through an invitation link from one address, in an
 * hour. A whole team signing up on the clubhouse wifi is a dozen or so; a script making
 * accounts is stopped at fifteen, and the link's own `maxUses` caps it whatever the address.
 * `join-link` counts accounts created through one link in an hour, from any address.
 */
const MAX_ATTEMPTS: Record<string, number> = { photo: 60, chat: 120, signup: 15, "join-link": 30 };
const DEFAULT_MAX_ATTEMPTS = 8;
const WINDOW_MS: Record<string, number> = { signup: HOUR_MS, "join-link": HOUR_MS };
/** The longest window of any scope: rows older than this count for nothing. */
const LONGEST_WINDOW_MS = Math.max(DEFAULT_WINDOW_MS, ...Object.values(WINDOW_MS));

export function attemptsAllowed(scope: string): number {
  return MAX_ATTEMPTS[scope] ?? DEFAULT_MAX_ATTEMPTS;
}

export function attemptWindowMs(scope: string): number {
  return WINDOW_MS[scope] ?? DEFAULT_WINDOW_MS;
}

/**
 * Scopes counted per thing rather than per thing and address: a link's sign-ups are
 * limited however many addresses they come from.
 */
const ANY_ADDRESS = new Set(["join-link"]);

/**
 * Attempts are keyed by a hash of scope + client IP + identifier, so the table never
 * holds a raw address or email. Counting in the database rather than in memory means the
 * limit still holds when the app runs across several serverless instances.
 */
async function attemptKey(scope: string, identifier: string) {
  const subject = identifier.trim().toLowerCase();
  if (ANY_ADDRESS.has(scope)) return createHash("sha256").update(`${scope}:${subject}`).digest("hex");
  const headerList = await headers();
  // Vercel's own header first: it is set by the platform and cannot be supplied by the
  // caller. `x-forwarded-for`'s first entry is only as honest as whatever sits in front
  // of the app, and a key the client can vary is a limit it can step round.
  const forwarded =
    headerList.get("x-vercel-forwarded-for") ?? headerList.get("x-real-ip") ?? headerList.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  return createHash("sha256")
    .update(`${scope}:${ip}:${subject}`)
    .digest("hex");
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMinutes: number };

/** Allowed while the attempts in the window number no more than `allowedCount`. */
async function verdict(scope: string, key: string, allowedCount: number): Promise<RateLimitResult> {
  const windowMs = attemptWindowMs(scope);
  const attempts = await prisma.loginAttempt.findMany({
    where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (attempts.length <= allowedCount) return { allowed: true };
  const retryAfterMs = Math.max(0, attempts[0]!.createdAt.getTime() + windowMs - Date.now());
  return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil(retryAfterMs / 60000)) };
}

/** Whether one more attempt is allowed. Counts nothing. */
export async function checkRateLimit(scope: string, identifier: string): Promise<RateLimitResult> {
  return verdict(scope, await attemptKey(scope, identifier), attemptsAllowed(scope) - 1);
}

/**
 * Counts one attempt against the scope. Scopes guarding a secret count failures; the
 * ones limiting how much of something is made (`signup`, `photo`, `chat`) count each one.
 */
export async function recordAttempt(scope: string, identifier: string) {
  const key = await attemptKey(scope, identifier);
  await prisma.loginAttempt.create({ data: { key } });
  // Opportunistic cleanup so the table cannot grow without bound.
  await prisma.loginAttempt
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LONGEST_WINDOW_MS) } } })
    .catch(() => {});
}

/**
 * Counts an attempt and then asks whether it was within the limit — the order a limit on
 * making things needs: two requests at once each see the other's row, so a burst cannot
 * all slip in under the count before any of it is written.
 */
export async function takeAttempt(scope: string, identifier: string): Promise<RateLimitResult> {
  await recordAttempt(scope, identifier);
  return verdict(scope, await attemptKey(scope, identifier), attemptsAllowed(scope));
}

export async function clearAttempts(scope: string, identifier: string) {
  const key = await attemptKey(scope, identifier);
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
