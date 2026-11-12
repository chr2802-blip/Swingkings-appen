/**
 * Where the browser suite runs: one production server on its own port, against its own
 * database (`<name>_e2e`), never the dev one and never the integration suite's.
 * Plain values only — Playwright loads the config as CommonJS.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);
export const E2E_URL = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_AUTH_SECRET = "e2e-auth-secret-that-is-long-enough-to-sign-with";
export const E2E_CRON_SECRET = "e2e-cron-secret";

export function e2eDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.E2E_DATABASE_URL;
  const base = explicit ?? env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL (or E2E_DATABASE_URL) to run the browser tests");
  const url = new URL(base);
  if (!explicit) url.pathname = `${url.pathname.replace(/\/$/, "").replace(/_(e2e|test)$/, "")}_e2e`;
  if (!url.pathname.endsWith("_e2e")) throw new Error(`Refusing to run browser tests against ${url.pathname}: name must end in _e2e`);
  return url.toString();
}
