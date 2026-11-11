import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as chat } from "@/app/api/chat/route";
import { GET as realtimeToken } from "@/app/api/realtime/token/route";
import { announce } from "@/lib/realtime";
import { joinTeam, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
import { afterQueue } from "../helpers/next-mocks";

const REALTIME = {
  SUPABASE_URL: "https://swingkings.supabase.test/",
  SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SECRET_KEY: "secret",
  SUPABASE_JWT_SECRET: "jwt-secret",
};

afterEach(() => {
  for (const key of Object.keys(REALTIME)) delete process.env[key];
});

describe("GET /api/chat", () => {
  it("answers the team's latest messages, uncached", async () => {
    const { team, anna } = await makeSquad();
    await prisma.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "Hej" } });
    await signIn(anna);
    const response = await chat();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).messages.map((m: { body: string }) => m.body)).toEqual(["Hej"]);
  });

  it("refuses the signed-out and the teamless", async () => {
    expect((await chat()).status).toBe(401);
    await signIn(await makeUser());
    expect((await chat()).status).toBe(401);
  });
});

describe("GET /api/realtime/token", () => {
  it("says the chat should poll when Realtime is not configured", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    expect(await (await realtimeToken()).json()).toEqual({ enabled: false });
  });

  it("hands out a short token naming every one of their teams, and the channel of the one on screen", async () => {
    Object.assign(process.env, REALTIME);
    const { team, anna } = await makeSquad();
    const second = await makeTeam("Anden");
    await joinTeam(anna.id, second.id);
    await signIn(anna);

    const body = await (await realtimeToken()).json();
    expect(body).toMatchObject({ enabled: true, url: "https://swingkings.supabase.test", publishableKey: "publishable", topic: `team:${team.id}` });
    const claims = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ sub: anna.id, role: "authenticated" });
    expect(claims.teams.sort()).toEqual([team.id, second.id].sort());
    expect(JSON.stringify(body)).not.toContain("jwt-secret");
    expect(JSON.stringify(body)).not.toContain('"secret"');
  });

  it("refuses the signed-out", async () => {
    expect((await realtimeToken()).status).toBe(401);
  });
});

describe("announce", () => {
  it("queues a nudge only when Realtime is configured", async () => {
    announce("team-1", "chat-posted");
    expect(afterQueue).toHaveLength(0);
    Object.assign(process.env, REALTIME);
    announce("team-1", "chat-posted");
    expect(afterQueue).toHaveLength(1);
  });
});

describe("row level security", () => {
  it("is switched on for every table Supabase would otherwise serve", async () => {
    const tables = await prisma.$queryRaw<{ name: string; rls: boolean }[]>`
      SELECT c.relname AS name, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`;
    expect(tables.length).toBeGreaterThan(20);
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([]);
  });
});
