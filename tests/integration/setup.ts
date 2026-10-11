import { config } from "dotenv";
import { afterAll, beforeEach } from "vitest";
import { testDatabaseUrl } from "./test-db";

config({ quiet: true });
const url = testDatabaseUrl();
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
delete process.env.VAPID_PRIVATE_KEY;

const { prisma } = await import("@/lib/prisma");

beforeEach(async () => {
  const [{ current }] = await prisma.$queryRaw<{ current: string }[]>`SELECT current_database() AS current`;
  if (!current.endsWith("_test")) throw new Error(`Refusing to truncate ${current}`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
