/**
 * Fails when prisma/schema.prisma and the migrations disagree — a schema edited without
 * a migration to match. The build runs `prisma migrate deploy` on Vercel, where a bad
 * migration has no rollback, so this is worth two seconds before every push.
 *
 * Replays the migrations into a throwaway `<db>_shadow` database (SHADOW_DATABASE_URL to
 * choose another) and diffs the result against the schema.
 */
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ quiet: true });
const base = process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL;
if (!base) {
  console.error("Set DATABASE_URL (or SHADOW_DATABASE_URL).");
  process.exit(1);
}
const url = new URL(base);
if (!process.env.SHADOW_DATABASE_URL) url.pathname = `${url.pathname.replace(/\/$/, "")}_shadow`;

// The shadow database has to exist before Prisma will replay into it.
const shadowName = decodeURIComponent(url.pathname.slice(1));
const admin = new PrismaClient({ datasourceUrl: base });
try {
  const found = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${shadowName}`;
  if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${shadowName.replace(/"/g, "")}"`);
} finally {
  await admin.$disconnect();
}

try {
  execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--shadow-database-url",
      url.toString(),
      "--exit-code",
    ],
    { stdio: "pipe" },
  );
  console.log("Migrations match the schema.");
} catch (error) {
  if (error.status === 2) {
    console.error("The schema has changes no migration makes. Run `npm run db:migrate -- --name <what>`.");
    console.error(String(error.stdout));
  } else {
    console.error(String(error.stderr || error.message));
  }
  process.exit(1);
}
