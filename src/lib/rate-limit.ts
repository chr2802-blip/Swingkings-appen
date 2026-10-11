import { createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "./prisma";

const WINDOW_MS = 15 * 60 * 1000;

/**
 * How many attempts a scope allows in `WINDOW_MS`. Eight is the guess-a-password number,
 * and is right for anything guarding a secret.
 *
 * `photo` counts pictures uploaded — the one write here that weighs up to a megabyte and
 * a half, stored in Postgres. Sixty in a quarter of an hour is a whole match's photos;
 * nothing short of a loop goes past it. `chat` counts messages sent: a lively thread is
 * a few a minute, so 120 is only reached by something that is not a person typing.
 */
const MAX_ATTEMPTS: Record<string, number> = { photo: 60, chat: 120 };
const DEFAULT_MAX_ATTEMPTS = 8;

export function attemptsAllowed(scope: string): number {
  return MAX_ATTEMPTS[scope] ?? DEFAULT_MAX_ATTEMPTS;
}

/**
 * Attempts are keyed by a hash of scope + client IP + identifier, so the table never
 * holds a raw address or email. Counting in the database rather than in memory means the
 * limit still holds when the app runs across several serverless instances.
 */
async function attemptKey(scope: string, identifier: string) {
  const headerList = await headers();
  // Vercel's own header first: it is set by the platform and cannot be supplied by the
  // caller. `x-forwarded-for`'s first entry is only as honest as whatever sits in front
  // of the app, and a key the client can vary is a limit it can step round.
  const forwarded =
    headerList.get("x-vercel-forwarded-for") ?? headerList.get("x-real-ip") ?? headerList.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  return createHash("sha256")
    .update(`${scope}:${ip}:${identifier.trim().toLowerCase()}`)
    .digest("hex");
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMinutes: number };

export async function checkRateLimit(scope: string, identifier: string): Promise<RateLimitResult> {
  const key = await attemptKey(scope, identifier);
  const since = new Date(Date.now() - WINDOW_MS);

  const attempts = await prisma.loginAttempt.findMany({
    where: { key, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (attempts.length < attemptsAllowed(scope)) return { allowed: true };

  const oldest = attempts[0]!.createdAt.getTime();
  const retryAfterMs = Math.max(0, oldest + WINDOW_MS - Date.now());
  return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil(retryAfterMs / 60000)) };
}

export async function recordFailedAttempt(scope: string, identifier: string) {
  const key = await attemptKey(scope, identifier);
  await prisma.loginAttempt.create({ data: { key } });
  // Opportunistic cleanup so the table cannot grow without bound.
  await prisma.loginAttempt
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS) } } })
    .catch(() => {});
}

export async function clearAttempts(scope: string, identifier: string) {
  const key = await attemptKey(scope, identifier);
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
