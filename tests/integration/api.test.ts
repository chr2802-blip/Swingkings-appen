import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as chat } from "@/app/api/chat/route";
import { CHAT_PAGE } from "@/lib/chat";
import { GET as realtimeToken } from "@/app/api/realtime/token/route";
import { GET as calendarFeed } from "@/app/api/calendar/[token]/route";
import { calendarPathFor, calendarToken } from "@/lib/calendar-feed";
import { parseCalendar } from "@/lib/ical";
import { announce } from "@/lib/realtime";
import { joinTeam, makeMatch, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
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
  const ask = (query = "") => chat(new Request(`https://app.example/api/chat${query}`));

  it("answers the team's latest messages, uncached", async () => {
    const { team, anna } = await makeSquad();
    await prisma.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "Hej" } });
    await signIn(anna);
    const response = await ask();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual(["Hej"]);
    expect(body.more).toBe(false);
  });

  it("answers the page before a message with ?before=, and not before another team's", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await prisma.chatMessage.createMany({
      data: Array.from({ length: CHAT_PAGE + 2 }, (_, i) => ({ teamId: team.id, authorId: anna.id, body: `${i}`, createdAt: new Date(1_900_000_000_000 + i * 1000) })),
    });
    const theirs = await prisma.chatMessage.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "fremmed" } });
    await signIn(anna);
    const latest = await (await ask()).json();
    expect(latest.more).toBe(true);
    const response = await ask(`?before=${latest.messages[0].id}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ messages: [{ body: "0" }, { body: "1" }], more: false });
    expect((await ask(`?before=${theirs.id}`)).status).toBe(404);
  });

  it("refuses the signed-out and the teamless", async () => {
    expect((await ask()).status).toBe(401);
    expect((await ask("?before=x")).status).toBe(401);
    await signIn(await makeUser());
    expect((await ask()).status).toBe(401);
  });
});

describe("GET /api/calendar/<token>.ics", () => {
  const fetchFeed = (path: string) => {
    const token = path.replace("/api/calendar/", "");
    return calendarFeed(new Request(`https://app.example${path}`), { params: Promise.resolve({ token }) });
  };

  it("serves the member's team's activities with no session, a cancelled one as cancelled", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Naboerne");
    const match = await makeMatch(team.id, { opponent: "AB" });
    await prisma.match.update({ where: { id: match.id }, data: { isHome: true } });
    const party = await makeMatch(team.id, { kind: "OTHER", title: "Julefrokost" });
    await prisma.match.update({ where: { id: party.id }, data: { cancelledAt: new Date() } });
    await makeMatch(other.team.id, { opponent: "Fremmede" });
    // Long ago: left out.
    await makeMatch(team.id, { opponent: "Gammel", startsAt: new Date(Date.now() - 400 * 86_400_000) });

    const response = await fetchFeed(await calendarPathFor(anna.id, team.id));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const events = parseCalendar(await response.text());
    expect(events.map((e) => [e.summary, e.cancelled])).toEqual([
      ["Hjemme mod AB", false],
      ["Aflyst: Julefrokost", true],
    ]);
    expect(events[0]!.url).toBe(`https://app.example/aktiviteter/${match.id}`);
  });

  it("is not found for a forged token, another team, a member who left, or a new password", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Naboerne");
    const path = await calendarPathFor(anna.id, team.id);

    // The same member and team, another signature.
    expect((await fetchFeed(path.replace(/\.[\w-]{32}\.ics$/, `.${"A".repeat(32)}.ics`))).status).toBe(404);
    expect((await fetchFeed("/api/calendar/nonsense.ics")).status).toBe(404);
    // Signed for a team Anna is not on.
    expect((await fetchFeed(`/api/calendar/${calendarToken(anna.id, other.team.id, 0)}.ics`)).status).toBe(404);
    // Her token, the other team's id in it.
    expect((await fetchFeed(path.replace(team.id, other.team.id))).status).toBe(404);

    await prisma.user.update({ where: { id: anna.id }, data: { tokenVersion: { increment: 1 } } });
    expect((await fetchFeed(path)).status).toBe(404);
    const fresh = await calendarPathFor(anna.id, team.id);
    expect((await fetchFeed(fresh)).status).toBe(200);

    await prisma.teamMember.delete({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } });
    expect((await fetchFeed(fresh)).status).toBe(404);
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
