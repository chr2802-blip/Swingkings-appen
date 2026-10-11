import { execSync } from "node:child_process";
import { config } from "dotenv";
import { testDatabaseUrl } from "./test-db";

/** Creates (if missing) and migrates the test database once per run. */
export default function setup() {
  config({ quiet: true });
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "pipe",
  });
}
