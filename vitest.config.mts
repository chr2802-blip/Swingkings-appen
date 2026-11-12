import { defineConfig } from "vitest/config";
import path from "path";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

/**
 * Two kinds of test. **Unit** needs nothing running and gates the Vercel build.
 * **Integration** drives the real lib code against a real Postgres — a separate
 * database named after DATABASE_URL with `_test` on the end (or TEST_DATABASE_URL),
 * created and migrated by `tests/integration/global-setup.ts`. Never the dev database.
 */
export default defineConfig({
  // Server actions that render (`src/app/actions/feed.tsx`) hold JSX; tsconfig preserves it
  // for Next, so the tests compile it themselves.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    env: { TZ: "UTC" },
    // An `it.only` left in is a file reduced to one test, which reads as a pass.
    allowOnly: !process.env.CI,
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
