import { PrismaClient, type MemberRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { E2E_AUTH_SECRET, e2eDatabaseUrl } from "./env";

/** The browser suite's own client, on the `_e2e` database. Seeds and inspects; the app writes. */
export const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });

export const PASSWORD = "e2e-kodeord-langt-nok";
let hash: Promise<string> | undefined;
const passwordHash = () => (hash ??= bcrypt.hash(PASSWORD, 10));

export async function resetDatabase() {
  const [{ current }] = await db.$queryRaw<{ current: string }[]>`SELECT current_database() AS current`;
  if (!current.endsWith("_e2e")) throw new Error(`Refusing to truncate ${current}`);
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let counter = 0;

export async function member(teamId: string, name: string, role: MemberRole = "PLAYER") {
  const user = await db.user.create({
    data: {
      email: `${name.toLowerCase().replace(/\W/g, "")}${counter++}@e2e.dk`,
      name,
      passwordHash: await passwordHash(),
      activeTeamId: teamId,
      memberships: { create: { teamId, role } },
    },
  });
  return user;
}

/** A team with a coach, a treasurer and two players — the cast of most specs. */
export async function squad(name = "Swingkings") {
  const team = await db.team.create({ data: { name } });
  const admin = await member(team.id, "Træner Tom", "ADMIN");
  const treasurer = await member(team.id, "Kasserer Kim", "TREASURER");
  const anna = await member(team.id, "Anna");
  const bo = await member(team.id, "Bo");
  return { team, admin, treasurer, anna, bo };
}

/** The session cookie a real login would set, for a test that is not about logging in. */
export async function sessionCookie(userId: string) {
  const { tokenVersion } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  const value = await new SignJWT({ sub: userId, ver: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(E2E_AUTH_SECRET));
  return { name: "swingkings_session", value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" as const };
}
