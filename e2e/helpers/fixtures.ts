import { test as base, expect, type Page } from "@playwright/test";
import { resetDatabase, sessionCookie } from "./database";

/**
 * Every test starts from an empty database, and `loginAs` puts a session straight into
 * the browser. `auth.spec.ts` drives the real login form; nothing else needs to.
 */
export const test = base.extend<{ loginAs: (user: { id: string }) => Promise<Page> }>({
  page: async ({ page }, provide, testInfo) => {
    await resetDatabase();
    await provide(page);
    // The HTML report is an artifact that is not always reachable; the job log always is.
    // So a failure also writes where the page was and what it said.
    if (testInfo.status !== testInfo.expectedStatus) {
      const text = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "(no body)");
      console.log(`\n--- page at failure: ${page.url()}\n${text.slice(0, 2000)}\n---`);
    }
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
