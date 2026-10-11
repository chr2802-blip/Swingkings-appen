/**
 * Which database the integration tests use: TEST_DATABASE_URL, or DATABASE_URL with
 * `_test` appended to its name. Refuses anything not ending in `_test`, so the tests'
 * truncation can never reach real data.
 */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  const base = explicit ?? env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) to run the integration tests");
  const url = new URL(base);
  if (!explicit) url.pathname = `${url.pathname.replace(/\/$/, "").replace(/_test$/, "")}_test`;
  if (!url.pathname.endsWith("_test")) throw new Error(`Refusing to test against ${url.pathname}: name must end in _test`);
  return url.toString();
}
