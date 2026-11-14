import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seasonPreview, seasonStart, startSeason, teamSeasons } from "@/lib/season-data";
import { readSummary } from "@/lib/season";
import { startNewSeason } from "@/app/actions/season";
import { formData, makeInviteLink, makeMatch, makeSquad, signIn } from "../helpers/factories";
import { expectDenied, expectRedirect } from "../helpers/expect";

const DAY = 24 * 60 * 60 * 1000;
const seasonForm = (fields: Record<string, string> = {}) => formData({ name: "Sæson 2026", confirm: "on", ...fields });

/** A season's worth of everything on one team: what goes, and what must stay. */
async function playedSeason(name = "Swingkings") {
  const squad = await makeSquad(name);
  const { team, admin, treasurer, anna, bo } = squad;
  const fine = (playerId: string, units: number, reason: string, extra: { clearedAt?: Date; challengeId?: string } = {}) =>
    prisma.fine.create({ data: { teamId: team.id, playerId, reason, units, unitPriceKr: 10, issuedById: treasurer.id, ...extra } });

  await fine(anna.id, 2, "For sent", { clearedAt: new Date() });
  await fine(anna.id, 3, "For sent");
  await fine(bo.id, 1, "Rødt kort");
  const won = await prisma.challenge.create({
    data: { teamId: team.id, description: "Straffe", units: 1, status: "SETTLED", reportedById: anna.id, winnerId: anna.id, loserId: bo.id },
  });
  await fine(anna.id, -1, "Udfordring", { challengeId: won.id });
  await fine(bo.id, 1, "Udfordring", { challengeId: won.id });
  await prisma.challenge.create({
    data: { teamId: team.id, description: "Armlægning", units: 1, reportedById: bo.id, winnerId: bo.id, loserId: anna.id },
  });

  const past = await makeMatch(team.id, { startsAt: new Date(Date.now() - 7 * DAY) });
  const pastTask = await prisma.task.create({
    data: { teamId: team.id, title: "Tøjvask", matchId: past.id, doneAt: new Date(), assignees: { create: [{ userId: anna.id }, { userId: bo.id }] } },
  });
  await prisma.activitySignup.create({ data: { teamId: team.id, matchId: past.id, userId: anna.id, going: true } });
  const upcoming = await makeMatch(team.id, { startsAt: new Date(Date.now() + 7 * DAY) });
  const upcomingTask = await prisma.task.create({
    data: { teamId: team.id, title: "Frugt", matchId: upcoming.id, assignees: { create: { userId: anna.id } } },
  });
  const doneLoose = await prisma.task.create({
    data: { teamId: team.id, title: "Bolde", doneAt: new Date(), assignees: { create: { userId: anna.id } } },
  });
  const openLoose = await prisma.task.create({ data: { teamId: team.id, title: "Net", assignees: { create: { userId: bo.id } } } });
  await makeInviteLink({ teamId: team.id, createdById: admin.id });
  await prisma.teamMember.updateMany({ where: { teamId: team.id, userId: { in: [anna.id, bo.id] } }, data: { duesPaidAt: new Date() } });
  await prisma.fineType.create({ data: { teamId: team.id, name: "For sent", units: 1 } });
  await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Tøjvask" } });

  return { ...squad, past, pastTask, upcoming, upcomingTask, doneLoose, openLoose };
}

/** Everything `playedSeason` makes, counted for one team. */
async function counts(teamId: string) {
  const [fines, challenges, matches, tasks, signups, links, paid, members, fineTypes, templates] = await Promise.all([
    prisma.fine.count({ where: { teamId } }),
    prisma.challenge.count({ where: { teamId } }),
    prisma.match.count({ where: { teamId } }),
    prisma.task.count({ where: { teamId } }),
    prisma.activitySignup.count({ where: { teamId } }),
    prisma.inviteLink.count({ where: { teamId } }),
    prisma.teamMember.count({ where: { teamId, duesPaidAt: { not: null } } }),
    prisma.teamMember.count({ where: { teamId } }),
    prisma.fineType.count({ where: { teamId } }),
    prisma.taskTemplate.count({ where: { teamId } }),
  ]);
  return { fines, challenges, matches, tasks, signups, links, paid, members, fineTypes, templates };
}

describe("startNewSeason", () => {
  it("keeps a summary, deletes the season's fines, challenges and finished activities, and lands on the summaries", async () => {
    const season = await playedSeason();
    const { team, admin } = season;
    await signIn(admin);

    await expectRedirect(() => startNewSeason(undefined, seasonForm({ name: "  Sæson 2026  " })), "/hold/saesoner");

    const saved = await prisma.season.findFirstOrThrow({ where: { teamId: team.id } });
    expect(saved.name).toBe("Sæson 2026");
    expect(saved.startedAt).toEqual(team.createdAt);
    expect(readSummary(saved.summary)).toEqual({
      fines: 3,
      kr: 60,
      topFined: [
        { name: "Anna", units: 4, kr: 40 },
        { name: "Bo", units: 2, kr: 20 },
      ],
      topReason: { reason: "For sent", count: 2 },
      challenges: 1,
      topChallenger: { name: "Anna", wins: 1 },
      tasks: 2,
      topWorker: { name: "Anna", tasks: 2 },
      activities: 1,
    });

    expect(await counts(team.id)).toEqual({
      fines: 0,
      challenges: 0,
      matches: 1,
      tasks: 2,
      signups: 0,
      links: 0,
      paid: 0,
      members: 4,
      fineTypes: 1,
      templates: 1,
    });
    const left = await prisma.task.findMany({ where: { teamId: team.id }, select: { id: true } });
    expect(left.map((t) => t.id).sort()).toEqual([season.upcomingTask.id, season.openLoose.id].sort());
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).seasonStartedAt).toEqual(saved.endedAt);
    expect(await seasonStart(team.id)).toEqual(saved.endedAt);
  });

  it("leaves another team's season whole", async () => {
    const mine = await playedSeason();
    const theirs = await playedSeason("Andre");
    const before = await counts(theirs.team.id);
    await signIn(mine.admin);
    await expectRedirect(() => startNewSeason(undefined, seasonForm()), "/hold/saesoner");
    expect(await counts(theirs.team.id)).toEqual(before);
    expect(await prisma.season.count({ where: { teamId: theirs.team.id } })).toBe(0);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: theirs.team.id } })).seasonStartedAt).toBeNull();
  });

  it("asks for a name and the tick, and touches nothing without them", async () => {
    const { team, admin } = await playedSeason();
    const before = await counts(team.id);
    await signIn(admin);
    expect(await startNewSeason(undefined, formData({ name: "Sæson 2026" }))).toEqual({
      ok: false,
      error: "Sæt flueben for at bekræfte, at det ikke kan fortrydes.",
    });
    expect(await startNewSeason(undefined, formData({ name: "  ", confirm: "on" }))).toEqual({
      ok: false,
      error: "Giv sæsonen der slutter et navn.",
    });
    expect(await startNewSeason(undefined, seasonForm({ name: "x".repeat(61) }))).toEqual({
      ok: false,
      error: "Teksten er for lang (højst 60 tegn).",
    });
    expect(await counts(team.id)).toEqual(before);
    expect(await prisma.season.count()).toBe(0);
  });

  it("is refused to a treasurer and a player", async () => {
    const { team, treasurer, anna } = await playedSeason();
    const before = await counts(team.id);
    for (const who of [treasurer, anna]) {
      await signIn(who);
      await expectDenied(() => startNewSeason(undefined, seasonForm()));
    }
    expect(await counts(team.id)).toEqual(before);
  });
});

describe("startSeason", () => {
  it("ends a season once when pressed twice at the same moment", async () => {
    const { team } = await playedSeason();
    const results = await Promise.all([startSeason(team.id, "A"), startSeason(team.id, "B")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Den nye sæson er allerede startet." });
    expect(await prisma.season.count({ where: { teamId: team.id } })).toBe(1);
  });

  it("starts the next season where the last ended, summing only what came after", async () => {
    const { team, anna, treasurer } = await makeSquad();
    const first = await startSeason(team.id, "Første", new Date(Date.now() - 30 * DAY));
    expect(first.ok).toBe(true);
    await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "Mobil", units: 1, unitPriceKr: 10, issuedById: treasurer.id } });
    expect((await startSeason(team.id, "Anden")).ok).toBe(true);

    const [latest, earlier] = await teamSeasons(team.id);
    expect(latest.name).toBe("Anden");
    expect(latest.startedAt).toEqual(earlier.endedAt);
    expect(latest.summary.fines).toBe(1);
    expect(earlier.summary.fines).toBe(0);
  });
});

describe("seasonPreview", () => {
  it("says what is still owed, by whom, and what would go", async () => {
    const { team } = await playedSeason();
    await playedSeason("Andre");
    expect(await seasonPreview(team.id)).toMatchObject({
      startedAt: team.createdAt,
      fines: 5,
      challenges: 2,
      activities: 1,
      links: 1,
      members: 4,
      duesPaid: 2,
      // Anna: 3 − 1 challenged away; Bo: 1 + 1 taken on.
      owingPlayers: 2,
      owingKr: 40,
    });
  });
});

describe("teamSeasons", () => {
  it("lists only the team's own seasons", async () => {
    const { team } = await makeSquad();
    const other = await makeSquad("Andre");
    await startSeason(other.team.id, "Deres");
    expect(await teamSeasons(team.id)).toEqual([]);
    expect((await teamSeasons(other.team.id)).map((s) => s.name)).toEqual(["Deres"]);
  });
});
