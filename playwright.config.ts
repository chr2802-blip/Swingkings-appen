import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_SECRET, E2E_CRON_SECRET, E2E_PORT, E2E_URL, e2eDatabaseUrl } from "./e2e/helpers/env";

loadEnv({ path: path.join(__dirname, ".env"), quiet: true });
const databaseUrl = e2eDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  // One server and one database, so one worker: every test truncates the database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: E2E_URL,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } }],
  // Served as production does, from the build `npm run e2e` makes first.
  webServer: {
    command: `npx next start --port ${E2E_PORT} --hostname 127.0.0.1`,
    url: `${E2E_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      AUTH_SECRET: E2E_AUTH_SECRET,
      CRON_SECRET: E2E_CRON_SECRET,
      NODE_ENV: "production",
      TZ: "UTC",
      // No VAPID keys and no Supabase: push stays inert and the chat polls.
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      SUPABASE_URL: "",
    },
  },
});
