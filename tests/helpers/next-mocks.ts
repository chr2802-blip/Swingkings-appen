/**
 * Stand-ins for the per-request Next.js APIs the server actions lean on: cookies,
 * headers, redirect, notFound, revalidatePath and `after`. The stores are plain module
 * state that a test can reset and inspect, so the real auth, session and rate-limit
 * code runs unchanged outside a request.
 */

export const cookieStore = new Map<string, string>();
export const headerStore = new Map<string, string>();

/** Thrown in place of Next's redirect(), which normally unwinds the request. */
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.name = "RedirectError";
  }
}

/** Thrown in place of Next's notFound(). */
export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}

type CookieInit = { name: string; value: string } & Record<string, unknown>;

export const cookiesMock = {
  get(name: string) {
    const value = cookieStore.get(name);
    return value === undefined ? undefined : { name, value };
  },
  has(name: string) {
    return cookieStore.has(name);
  },
  set(nameOrInit: string | CookieInit, value?: string) {
    if (typeof nameOrInit === "object") cookieStore.set(nameOrInit.name, nameOrInit.value);
    else cookieStore.set(nameOrInit, value ?? "");
  },
  delete(name: string) {
    cookieStore.delete(name);
  },
  getAll() {
    return [...cookieStore].map(([name, value]) => ({ name, value }));
  },
};

export const headersMock = {
  get(name: string) {
    return headerStore.get(name.toLowerCase()) ?? null;
  },
};

/**
 * What `after()` was handed during the test. Nothing runs by itself — a test that cares
 * about a push or a Realtime nudge calls `runAfter()`, the way the response ending would.
 */
export const afterQueue: (() => unknown)[] = [];

export async function runAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}

export function resetRequestState() {
  cookieStore.clear();
  headerStore.clear();
  afterQueue.length = 0;
  // A stable client address, so rate-limit keys are predictable per test.
  headerStore.set("x-forwarded-for", "203.0.113.10");
}

/** Simulates a different client, which gets its own rate-limit bucket. */
export function setClientIp(ip: string) {
  headerStore.set("x-forwarded-for", ip);
}

export const SESSION_COOKIE_NAME = "swingkings_session";

export function hasSessionCookie() {
  return cookieStore.has(SESSION_COOKIE_NAME);
}
