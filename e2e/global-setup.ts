import { execSync } from "node:child_process";
import { e2eDatabaseUrl } from "./helpers/env";

/** Creates (if missing) and migrates the browser suite's database once per run. */
export default function globalSetup() {
  const url = e2eDatabaseUrl();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "pipe" });
}
