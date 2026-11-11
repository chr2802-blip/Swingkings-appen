import { config } from "dotenv";
import { afterAll, beforeEach, vi } from "vitest";
import { testDatabaseUrl } from "./test-db";
import { NotFoundError, RedirectError, afterQueue, cookiesMock, headersMock, resetRequestState } from "../helpers/next-mocks";

config({ quiet: true });
const url = testDatabaseUrl();
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.AUTH_SECRET = "test-auth-secret-that-is-long-enough-to-sign-with";
process.env.CRON_SECRET = "test-cron-secret";
// Push and Realtime stay inert unless a test switches them on itself.
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_JWT_SECRET"]) delete process.env[key];

vi.mock("next/headers", () => ({
  cookies: async () => cookiesMock,
  headers: async () => headersMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
  notFound: () => {
    throw new NotFoundError();
  },
}));

// `after()` only works inside a request. Here it queues, and `runAfter()` drains.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => void afterQueue.push(task) };
});

// getCurrentUser is wrapped in React's cache(), which expects a render scope. Outside one
// it must call straight through, or a test would see the previous test's session.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { prisma } = await import("@/lib/prisma");

beforeEach(async () => {
  resetRequestState();
  const [{ current }] = await prisma.$queryRaw<{ current: string }[]>`SELECT current_database() AS current`;
  if (!current.endsWith("_test")) throw new Error(`Refusing to truncate ${current}`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
