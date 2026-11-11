import { test as base, expect, type Page } from "@playwright/test";
import { resetDatabase, sessionCookie } from "./database";

/**
 * Every test starts from an empty database, and `loginAs` puts a session straight into
 * the browser. `auth.spec.ts` drives the real login form; nothing else needs to.
 */
export const test = base.extend<{ loginAs: (user: { id: string }) => Promise<Page> }>({
  page: async ({ page }, provide) => {
    await resetDatabase();
    await provide(page);
  },
  loginAs: async ({ page, context }, provide) => {
    await provide(async (user) => {
      await context.clearCookies();
      await context.addCookies([await sessionCookie(user.id)]);
      return page;
    });
  },
});

export { expect };
