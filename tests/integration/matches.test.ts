import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// The feed is fetched from KampKlar; here it is answered locally, so the sync runs end to
// end without a network and without DNS.
const feed = vi.hoisted(() => ({ respond: (): Response => new Response("", { status: 500 }), urls: [] as string[] }));
vi.mock("@/lib/safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-fetch")>()),
  safeFetch: async (url: URL) => {
    feed.urls.push(url.toString());
    return feed.respond();
  },
}));

import {
  addStandardTasks,
  deleteMatch,
  deleteTaskTemplate,
  saveMatch,
  saveTaskTemplate,
  syncCalendar,
} from "@/app/actions/matches";
import { fetchCalendar, syncTeamCalendar } from "@/lib/kampklar";
import { upcomingMatchOptions } from "@/lib/match-data";
import { formData, makeMatch, makeSquad, signIn } from "../helpers/factories";
import { captureRedirect, expectDenied, expectRedirect } from "../helpers/expect";

const ics = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (uid: string, summary: string, start: string) =>
  ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${start}`, `SUMMARY:${summary}`, "END:VEVENT"].join("\r\n");

beforeEach(() => {
  feed.urls.length = 0;
  feed.respond = () => new Response("", { status: 500 });
});

describe("saveMatch", () => {
  it("adds a hand-made match on the team's clock, with the standard jobs if asked, and opens it", async () => {
    const { team, admin } = await makeSquad();
    await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Tøjvask", people: 1 } });
    await signIn(admin);

    const to = await captureRedirect(() =>
      saveMatch(undefined, formData({ opponent: "B.93", startsAt: "2030-06-01T14:30", venue: "away", location: "Banen", addTemplates: "on" })),
    );
    const match = await prisma.match.findFirstOrThrow({ where: { teamId: team.id }, include: { tasks: true } });
    expect(to).toBe(`/kampe/${match.id}`);
    expect(match).toMatchObject({ title: "B.93 - Swingkings", isHome: false, source: "MANUAL", location: "Banen" });
    expect(match.startsAt.toISOString()).toBe("2030-06-01T12:30:00.000Z");
    expect(match.tasks.map((t) => t.title)).toEqual(["Tøjvask"]);
  });

  it("edits a hand-made match but not one from KampKlar", async () => {
    const { team, admin } = await makeSquad();
    const manual = await makeMatch(team.id);
    const synced = await makeMatch(team.id, { source: "KAMPKLAR" });
    await signIn(admin);
    const edit = (id: string) => saveMatch(undefined, formData({ id, opponent: "AB", startsAt: "2030-06-01T10:00", venue: "home" }));

    expect(await edit(manual.id)).toEqual({ ok: true });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: manual.id } })).toMatchObject({ title: "Swingkings - AB", isHome: true });
    expect(await edit(synced.id)).toEqual({ ok: false, error: "Kampen kommer fra KampKlar og rettes der." });
    expect(await edit("findes-ikke")).toEqual({ ok: false, error: "Kampen findes ikke længere." });
  });

  it("refuses a missing opponent and a time it cannot read", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    expect(await saveMatch(undefined, formData({ opponent: "", startsAt: "2030-06-01T10:00" }))).toEqual({ ok: false, error: "Skriv modstanderen." });
    expect(await saveMatch(undefined, formData({ opponent: "AB", startsAt: "i morgen" }))).toEqual({ ok: false, error: "Tidspunktet kunne ikke læses." });
  });

  it("is the admin's", async () => {
    const { treasurer } = await makeSquad();
    await signIn(treasurer);
    await expectDenied(() => saveMatch(undefined, formData({ opponent: "AB", startsAt: "2030-06-01T10:00" })));
    await expectDenied(() => deleteMatch(undefined, formData({ id: "x" })));
    await expectDenied(() => syncCalendar());
  });
});

describe("deleteMatch", () => {
  it("deletes a hand-made match and its jobs, never a KampKlar one or another team's", async () => {
    const { team, admin } = await makeSquad();
    const other = await makeSquad("Andre");
    const manual = await makeMatch(team.id);
    await prisma.task.create({ data: { teamId: team.id, title: "Kørsel", matchId: manual.id } });
    const synced = await makeMatch(team.id, { source: "KAMPKLAR" });
    const theirs = await makeMatch(other.team.id);
    await signIn(admin);

    await expectRedirect(() => deleteMatch(undefined, formData({ id: manual.id })), "/kampe");
    expect(await prisma.task.count()).toBe(0);
    expect((await deleteMatch(undefined, formData({ id: synced.id })))?.ok).toBe(false);
    expect(await deleteMatch(undefined, formData({ id: theirs.id }))).toEqual({ ok: true });
    expect(await prisma.match.count()).toBe(2);
  });
});

describe("the KampKlar sync", () => {
  it("brings the feed in and says what it did", async () => {
    const { team, admin } = await makeSquad();
    await prisma.team.update({ where: { id: team.id }, data: { calendarUrl: "https://kampklar.dk/feed.ics" } });
    feed.respond = () => new Response(ics(vevent("a", "Swingkings - B.93", "20300601T120000Z"), vevent("b", "Træning", "20300602T170000Z")));
    await signIn(admin);

    expect(await syncCalendar()).toEqual({ ok: true, note: "Hentet fra KampKlar: 2 nye." });
    expect(feed.urls).toEqual(["https://kampklar.dk/feed.ics"]);
    expect(await syncCalendar()).toEqual({ ok: true, note: "Hentet fra KampKlar: 2 opdateret." });
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).calendarSyncedAt).not.toBeNull();
  });

  it("says so when there is no link", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    expect(await syncCalendar()).toEqual({ ok: false, error: "Holdet har ikke et KampKlar-kalenderlink endnu." });
  });

  it("explains every way the feed can let it down", async () => {
    const url = "https://kampklar.dk/feed.ics";
    expect(await fetchCalendar("ikke et link")).toEqual({ ok: false, error: "Kalenderlinket er ikke en gyldig adresse." });

    feed.respond = () => new Response("nope", { status: 404 });
    expect(await fetchCalendar(url)).toEqual({ ok: false, error: "KampKlar svarede 404. Tjek linket." });

    feed.respond = () => new Response("<html>login</html>");
    expect((await fetchCalendar(url)).ok).toBe(false);

    feed.respond = () => new Response("x", { headers: { "content-length": "5000000" } });
    expect(await fetchCalendar(url)).toEqual({ ok: false, error: "Kalenderen er for stor." });

    feed.respond = () => new Response("BEGIN:VCALENDAR" + "x".repeat(2_000_001));
    expect(await fetchCalendar(url)).toEqual({ ok: false, error: "Kalenderen er for stor." });

    feed.respond = () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await fetchCalendar(url)).toEqual({ ok: false, error: "Kalenderen kunne ikke hentes. Tjek linket fra KampKlar." });
  });

  it("reaches syncTeamCalendar from the daily job with no actor", async () => {
    const { team } = await makeSquad();
    await prisma.team.update({ where: { id: team.id }, data: { calendarUrl: "https://kampklar.dk/feed.ics" } });
    feed.respond = () => new Response(ics());
    expect(await syncTeamCalendar(team.id, null)).toMatchObject({ ok: true, created: 0 });
  });
});

describe("standard jobs", () => {
  it("adds, edits and deletes templates, and hands them out on a match", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    expect(await addStandardTasks(undefined, formData({ matchId: (await makeMatch(team.id)).id }))).toEqual({
      ok: false,
      error: "Holdet har ingen standardopgaver endnu. Opret dem under Opgaver → Standardopgaver.",
    });

    await saveTaskTemplate(undefined, formData({ title: "Tøjvask", people: "1" }));
    const template = await prisma.taskTemplate.findFirstOrThrow({ where: { teamId: team.id } });
    await saveTaskTemplate(undefined, formData({ id: template.id, title: "Kørsel", people: "2", description: "Til udebane" }));
    expect(await prisma.taskTemplate.findUniqueOrThrow({ where: { id: template.id } })).toMatchObject({ title: "Kørsel", people: 2 });

    const match = await makeMatch(team.id);
    expect(await addStandardTasks(undefined, formData({ matchId: match.id }))).toEqual({ ok: true, note: "1 opgaver er fordelt." });
    const task = await prisma.task.findFirstOrThrow({ where: { matchId: match.id }, include: { assignees: true } });
    expect(task.assignees).toHaveLength(2);
    expect(task.dueAt).toEqual(match.startsAt);

    await deleteTaskTemplate(undefined, formData({ id: template.id }));
    expect(await prisma.taskTemplate.count()).toBe(0);
  });

  it("refuses a nameless template, too many people, and another team's match", async () => {
    const { admin } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(admin);
    expect(await saveTaskTemplate(undefined, formData({ title: "", people: "1" }))).toEqual({ ok: false, error: "Giv opgaven et navn." });
    expect((await saveTaskTemplate(undefined, formData({ title: "X", people: "21" })))?.ok).toBe(false);
    expect(await addStandardTasks(undefined, formData({ matchId: (await makeMatch(other.team.id)).id }))).toEqual({ ok: false, error: "Kampen findes ikke." });
  });

  it("is the admin's", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    await expectDenied(() => saveTaskTemplate(undefined, formData({ title: "X", people: "1" })));
    await expectDenied(() => deleteTaskTemplate(undefined, formData({ id: "x" })));
    await expectDenied(() => addStandardTasks(undefined, formData({ matchId: "x" })));
  });
});

describe("upcomingMatchOptions", () => {
  it("lists upcoming and last week's matches, not cancelled ones, trainings or old ones", async () => {
    const { team } = await makeSquad();
    const day = 86_400_000;
    await makeMatch(team.id, { opponent: "Om to dage", startsAt: new Date(Date.now() + 2 * day) });
    await makeMatch(team.id, { opponent: "I går", startsAt: new Date(Date.now() - day) });
    await makeMatch(team.id, { opponent: "Sidste måned", startsAt: new Date(Date.now() - 30 * day) });
    await makeMatch(team.id, { opponent: "Træning", kind: "TRAINING" });
    const cancelled = await makeMatch(team.id, { opponent: "Aflyst" });
    await prisma.match.update({ where: { id: cancelled.id }, data: { cancelledAt: new Date() } });

    const labels = (await upcomingMatchOptions(team.id)).map((o) => o.label.split(" · ")[0]);
    expect(labels).toEqual(["I går", "Om to dage"]);
  });
});
