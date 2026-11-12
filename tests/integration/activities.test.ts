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
  copyTasks,
  deleteActivity,
  deleteTaskTemplate,
  saveActivity,
  saveTaskTemplate,
  setSignup,
  syncCalendar,
} from "@/app/actions/activities";
import { fetchCalendar, syncTeamCalendar } from "@/lib/kampklar";
import { LISTED_ACTIVITY, copyableActivities, templateOptions } from "@/lib/activity-data";
import { KIND_LABEL, activityName, signupSummary } from "@/lib/activity";
import { teamRoster } from "@/lib/roster";
import { formData, makeMatch, makeSquad, signIn } from "../helpers/factories";
import { captureRedirect, expectDenied, expectRedirect } from "../helpers/expect";

const ics = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (uid: string, summary: string, start: string) =>
  ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${start}`, `SUMMARY:${summary}`, "END:VEVENT"].join("\r\n");

beforeEach(() => {
  feed.urls.length = 0;
  feed.respond = () => new Response("", { status: 500 });
});

describe("saveActivity", () => {
  it("lets any player add an activity on the team's clock, with the ticked standard jobs, and opens it", async () => {
    const { team, anna } = await makeSquad();
    const wash = await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Grill", people: 1 } });
    await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Ikke valgt", people: 1 } });
    await signIn(anna);

    const to = await captureRedirect(() =>
      saveActivity(undefined, formData({ title: "Afslutningsfest", startsAt: "2030-06-01T19:30", location: "Klubhuset", templateId: [wash.id] })),
    );
    const match = await prisma.match.findFirstOrThrow({ where: { teamId: team.id }, include: { tasks: true } });
    expect(to).toBe(`/aktiviteter/${match.id}`);
    expect(match).toMatchObject({ kind: "OTHER", title: "Afslutningsfest", opponent: null, isHome: null, source: "MANUAL", location: "Klubhuset" });
    expect(match.startsAt.toISOString()).toBe("2030-06-01T17:30:00.000Z");
    expect(match.tasks.map((t) => t.title)).toEqual(["Grill"]);
    expect(activityName(match)).toBe("Afslutningsfest");
    expect(KIND_LABEL).toEqual({ MATCH: "Kamp", TRAINING: "Træning", OTHER: "Aktivitet" });
  });

  it("never makes a match or a training by hand, whatever the form says", async () => {
    const { team, anna } = await makeSquad();
    await signIn(anna);
    await captureRedirect(() => saveActivity(undefined, formData({ kind: "MATCH", opponent: "B.93", venue: "home", title: "Holdtur", startsAt: "2030-06-02T17:00" })));
    expect(await prisma.match.findFirstOrThrow({ where: { teamId: team.id } })).toMatchObject({ kind: "OTHER", title: "Holdtur", opponent: null, isHome: null });
  });

  it("copies an earlier activity's jobs onto a new one, but not another team's", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const last = await makeMatch(team.id, { kind: "OTHER", title: "Fest 2029", startsAt: new Date("2029-06-20T17:00:00Z") });
    await prisma.task.create({ data: { teamId: team.id, matchId: last.id, title: "Grill", dueAt: last.startsAt } });
    const theirs = await makeMatch(other.team.id);
    await signIn(anna);

    expect(await saveActivity(undefined, formData({ title: "Fest", startsAt: "2030-06-20T19:00", copyFromId: theirs.id }))).toEqual({
      ok: false,
      error: "Aktiviteten, der skulle kopieres opgaver fra, findes ikke.",
    });
    await captureRedirect(() => saveActivity(undefined, formData({ title: "Fest 2030", startsAt: "2030-06-20T19:00", copyFromId: last.id })));
    const copy = await prisma.match.findFirstOrThrow({ where: { title: "Fest 2030" }, include: { tasks: true } });
    expect(copy.tasks.map((t) => t.title)).toEqual(["Grill"]);
  });

  it("edits a hand-made activity — an old hand-made match becomes an activity — but not one from KampKlar or another team's", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const manual = await makeMatch(team.id);
    const synced = await makeMatch(team.id, { source: "KAMPKLAR" });
    const theirs = await makeMatch(other.team.id);
    await signIn(anna);
    const edit = (id: string) => saveActivity(undefined, formData({ id, title: "Klubdag", startsAt: "2030-06-01T10:00", note: "Tag madpakke med" }));

    expect(await edit(manual.id)).toEqual({ ok: true });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: manual.id } })).toMatchObject({
      kind: "OTHER",
      title: "Klubdag",
      opponent: null,
      isHome: null,
      note: "Tag madpakke med",
    });
    expect(await edit(synced.id)).toEqual({ ok: false, error: "Aktiviteten kommer fra KampKlar og rettes der." });
    expect(await edit(theirs.id)).toEqual({ ok: false, error: "Aktiviteten findes ikke længere." });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ title: "Swingkings - B.93" });
  });

  it("refuses a nameless activity, a name too long and a time it cannot read", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    expect(await saveActivity(undefined, formData({ title: "", startsAt: "2030-06-01T10:00" }))).toEqual({ ok: false, error: "Giv aktiviteten et navn." });
    expect((await saveActivity(undefined, formData({ title: "x".repeat(201), startsAt: "2030-06-01T10:00" })))?.ok).toBe(false);
    expect(await saveActivity(undefined, formData({ title: "Fest", startsAt: "i morgen" }))).toEqual({ ok: false, error: "Tidspunktet kunne ikke læses." });
    expect(await prisma.match.count()).toBe(0);
  });
});

describe("setSignup", () => {
  it("lets a player say they come, change their mind, and lists everybody against the roster", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const party = await makeMatch(team.id, { kind: "OTHER", title: "Afslutningsfest" });
    const answer = (going: string) => setSignup(undefined, formData({ activityId: party.id, going }));

    await signIn(anna);
    expect(await answer("yes")).toEqual({ ok: true });
    await signIn(bo);
    expect(await answer("yes")).toEqual({ ok: true });
    expect(await answer("no")).toEqual({ ok: true });

    const rows = await prisma.activitySignup.findMany({ where: { matchId: party.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.teamId === team.id)).toBe(true);
    const summary = signupSummary(await teamRoster(team.id), rows);
    expect(summary.going.map((m) => m.userId)).toEqual([anna.id]);
    expect(summary.notGoing.map((m) => m.userId)).toEqual([bo.id]);
    expect(summary.unanswered.map((m) => m.userId)).toContain(admin.id);
  });

  it("takes no answers for another team's activity, one from KampKlar, a cancelled one, or a muddled answer", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await makeMatch(other.team.id, { kind: "OTHER", title: "Deres fest" });
    const synced = await makeMatch(team.id, { source: "KAMPKLAR" });
    const cancelled = await prisma.match.create({
      data: { teamId: team.id, kind: "OTHER", title: "Aflyst fest", startsAt: new Date("2030-06-01T17:00:00Z"), cancelledAt: new Date() },
    });
    const party = await makeMatch(team.id, { kind: "OTHER", title: "Fest" });
    await signIn(anna);

    expect(await setSignup(undefined, formData({ activityId: theirs.id, going: "yes" }))).toEqual({ ok: false, error: "Aktiviteten findes ikke." });
    expect(await setSignup(undefined, formData({ activityId: synced.id, going: "yes" }))).toEqual({
      ok: false,
      error: "Der er ikke tilmelding til aktiviteter fra KampKlar.",
    });
    expect(await setSignup(undefined, formData({ activityId: cancelled.id, going: "yes" }))).toEqual({ ok: false, error: "Aktiviteten er aflyst." });
    expect(await setSignup(undefined, formData({ activityId: party.id, going: "måske" }))).toEqual({ ok: false, error: "Svar ja eller nej." });
    expect(await prisma.activitySignup.count()).toBe(0);
  });

  it("goes with the activity when it is deleted", async () => {
    const { team, anna } = await makeSquad();
    const party = await makeMatch(team.id, { kind: "OTHER", title: "Fest" });
    await signIn(anna);
    await setSignup(undefined, formData({ activityId: party.id, going: "yes" }));
    await expectRedirect(() => deleteActivity(undefined, formData({ id: party.id })), "/aktiviteter");
    expect(await prisma.activitySignup.count()).toBe(0);
  });

  it("leaves out the answer of somebody no longer on the team", () => {
    const roster = [{ userId: "a" }, { userId: "b" }];
    expect(signupSummary(roster, [{ userId: "gone", going: true }, { userId: "b", going: false }])).toEqual({
      going: [],
      notGoing: [{ userId: "b" }],
      unanswered: [{ userId: "a" }],
    });
  });
});

describe("deleteActivity", () => {
  it("deletes a hand-made activity and its jobs, never a KampKlar one or another team's", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const manual = await makeMatch(team.id);
    await prisma.task.create({ data: { teamId: team.id, title: "Kørsel", matchId: manual.id } });
    const synced = await makeMatch(team.id, { source: "KAMPKLAR" });
    const theirs = await makeMatch(other.team.id);
    await signIn(anna);

    await expectRedirect(() => deleteActivity(undefined, formData({ id: manual.id })), "/aktiviteter");
    expect(await prisma.task.count()).toBe(0);
    expect((await deleteActivity(undefined, formData({ id: synced.id })))?.ok).toBe(false);
    expect(await deleteActivity(undefined, formData({ id: theirs.id }))).toEqual({ ok: true });
    expect(await prisma.match.count()).toBe(2);
  });
});

describe("the KampKlar sync", () => {
  it("brings the feed in and says what it did", async () => {
    const { team, anna: admin } = await makeSquad();
    await prisma.team.update({ where: { id: team.id }, data: { calendarUrl: "https://kampklar.dk/feed.ics" } });
    feed.respond = () => new Response(ics(vevent("a", "Swingkings - B.93", "20300601T120000Z"), vevent("b", "Træning", "20300602T170000Z")));
    await signIn(admin);

    expect(await syncCalendar()).toEqual({ ok: true, note: "Hentet fra KampKlar: 2 nye." });
    expect(feed.urls).toEqual(["https://kampklar.dk/feed.ics"]);
    expect(await syncCalendar()).toEqual({ ok: true, note: "Hentet fra KampKlar: 2 opdateret." });
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).calendarSyncedAt).not.toBeNull();
  });

  it("says so when there is no link", async () => {
    const { anna: admin } = await makeSquad();
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
  it("are kept by admins, with whether the sync adds them by itself", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    await saveTaskTemplate(undefined, formData({ title: "Trøjevask", people: "1", autoAdd: "on" }));
    const template = await prisma.taskTemplate.findFirstOrThrow({ where: { teamId: team.id } });
    expect(template).toMatchObject({ autoAdd: true });
    await saveTaskTemplate(undefined, formData({ id: template.id, title: "Kørsel", people: "2", description: "Til udebane" }));
    expect(await prisma.taskTemplate.findUniqueOrThrow({ where: { id: template.id } })).toMatchObject({ title: "Kørsel", people: 2, autoAdd: false });
    expect(await templateOptions(team.id)).toEqual([{ id: template.id, title: "Kørsel", people: 2, autoAdd: false }]);
    await deleteTaskTemplate(undefined, formData({ id: template.id }));
    expect(await prisma.taskTemplate.count()).toBe(0);
  });

  it("refuse a nameless template and too many people", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    expect(await saveTaskTemplate(undefined, formData({ title: "", people: "1" }))).toEqual({ ok: false, error: "Giv opgaven et navn." });
    expect((await saveTaskTemplate(undefined, formData({ title: "X", people: "21" })))?.ok).toBe(false);
  });

  it("are a team setting: a player or a bødekasseformand may not change them", async () => {
    const { anna, treasurer } = await makeSquad();
    for (const who of [anna, treasurer]) {
      await signIn(who);
      await expectDenied(() => saveTaskTemplate(undefined, formData({ title: "X", people: "1" })));
      await expectDenied(() => deleteTaskTemplate(undefined, formData({ id: "x" })));
    }
  });

  it("are put on an activity by anybody, ticked ones only, and handed out", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const wash = await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Trøjevask", people: 2 } });
    const activity = await makeMatch(team.id);
    await signIn(anna);
    expect(await addStandardTasks(undefined, formData({ activityId: activity.id }))).toEqual({ ok: false, error: "Vælg mindst én standardopgave." });
    expect(await addStandardTasks(undefined, formData({ activityId: activity.id, templateId: [wash.id] }))).toEqual({ ok: true, note: "1 opgave er fordelt." });
    const task = await prisma.task.findFirstOrThrow({ where: { matchId: activity.id }, include: { assignees: true } });
    expect(task.assignees).toHaveLength(2);
    expect(task.dueAt).toEqual(activity.startsAt);

    const theirTemplate = await prisma.taskTemplate.create({ data: { teamId: other.team.id, title: "Deres" } });
    expect(await addStandardTasks(undefined, formData({ activityId: activity.id, templateId: [theirTemplate.id] }))).toEqual({
      ok: false,
      error: "Standardopgaverne findes ikke længere.",
    });
    expect(await addStandardTasks(undefined, formData({ activityId: (await makeMatch(other.team.id)).id, templateId: [wash.id] }))).toEqual({
      ok: false,
      error: "Aktiviteten findes ikke.",
    });
  });
});

describe("copying jobs", () => {
  it("copies an earlier activity's jobs onto this one, and says when there were none", async () => {
    const { team, anna } = await makeSquad();
    const from = await makeMatch(team.id, { kind: "OTHER", title: "Klubdag 2029", startsAt: new Date("2029-08-01T10:00:00Z") });
    const empty = await makeMatch(team.id, { kind: "OTHER", title: "Tom" });
    await prisma.task.createMany({ data: ["Kage", "Telt"].map((title) => ({ teamId: team.id, matchId: from.id, title, dueAt: from.startsAt })) });
    const to = await makeMatch(team.id, { kind: "OTHER", title: "Klubdag 2030" });
    await signIn(anna);

    expect(await copyTasks(undefined, formData({ activityId: to.id }))).toEqual({ ok: false, error: "Vælg den aktivitet, opgaverne skal kopieres fra." });
    expect(await copyTasks(undefined, formData({ activityId: to.id, copyFromId: empty.id }))).toEqual({ ok: false, error: "Der var ingen opgaver at kopiere." });
    expect(await copyTasks(undefined, formData({ activityId: to.id, copyFromId: from.id }))).toEqual({ ok: true, note: "2 opgaver er kopieret og fordelt." });
    expect(await prisma.task.count({ where: { matchId: to.id } })).toBe(2);
    expect(await copyTasks(undefined, formData({ activityId: "findes-ikke", copyFromId: from.id }))).toEqual({ ok: false, error: "Aktiviteten findes ikke." });
  });

  it("offers only activities with jobs, newest first, never the one being copied to", async () => {
    const { team } = await makeSquad();
    const old = await makeMatch(team.id, { kind: "OTHER", title: "Gammel", startsAt: new Date("2029-01-01T10:00:00Z") });
    const recent = await makeMatch(team.id, { kind: "OTHER", title: "Ny", startsAt: new Date("2029-06-01T10:00:00Z") });
    await makeMatch(team.id, { kind: "OTHER", title: "Uden opgaver" });
    for (const a of [old, recent]) await prisma.task.create({ data: { teamId: team.id, matchId: a.id, title: "x" } });
    const labels = (await copyableActivities(team.id, recent.id)).map((o) => o.label);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatch(/^Gammel · .* \(1 opgave\)$/);
    expect((await copyableActivities(team.id)).map((o) => o.label.split(" · ")[0])).toEqual(["Ny", "Gammel"]);
  });
});

describe("the everyday list", () => {
  it("leaves out trainings, unless a training has jobs on it", async () => {
    const { team } = await makeSquad();
    await makeMatch(team.id, { opponent: "B.93" });
    await makeMatch(team.id, { kind: "TRAINING", title: "Træning" });
    const busy = await makeMatch(team.id, { kind: "TRAINING", title: "Træning med kage" });
    await prisma.task.create({ data: { teamId: team.id, matchId: busy.id, title: "Kage" } });
    const listed = await prisma.match.findMany({ where: { teamId: team.id, ...LISTED_ACTIVITY }, orderBy: { title: "asc" } });
    expect(listed.map((m) => m.title)).toEqual(["Swingkings - B.93", "Træning med kage"]);
  });
});
