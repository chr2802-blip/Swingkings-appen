import { afterEach, describe, expect, it, vi } from "vitest";

// What reaches the push service is recorded here instead of being sent.
const pushed = vi.hoisted(() => [] as { to: string[]; payload: { title: string; body: string; url?: string; tag?: string } }[]);
vi.mock("@/lib/push", () => ({
  sendPushToUsers: async (to: string[], payload: (typeof pushed)[number]["payload"]) => {
    pushed.push({ to, payload });
    return to.length;
  },
}));

import { prisma } from "@/lib/prisma";
import { applyCalendar } from "@/lib/kampklar";
import { addTemplatesToActivity, announceActivityMoves } from "@/lib/tasks";
import { afterQueue } from "../helpers/next-mocks";
import type { CalendarEvent } from "@/lib/ical";
import { MAX_SEPARATE_MOVE_PUSHES } from "@/lib/tasks";
import { makeMember, makeTeam } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";

const now = new Date("2026-10-11T10:00:00Z");

function event(uid: string, summary: string, startsAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return { uid, summary, startsAt: new Date(startsAt), endsAt: null, description: null, location: null, categories: [], cancelled: false, ...extra };
}

describe("applyCalendar", () => {
  it("adds matches, hands out the standard jobs fairly, and updates rather than duplicates", async () => {
    const team = await makeTeam("Swingkings");
    const players = await Promise.all(["Anna", "Bo", "Carl"].map((n) => makeMember(team.id, n)));
    await prisma.taskTemplate.createMany({
      data: [
        { teamId: team.id, title: "Tøjvask", people: 1 },
        { teamId: team.id, title: "Kørsel", people: 2 },
        // Chosen by hand per activity; the sync leaves it alone.
        { teamId: team.id, title: "Opkridtning", people: 1, autoAdd: false },
      ],
    });

    const first = await applyCalendar(
      team.id,
      team.name,
      [
        event("a", "Swingkings - B.93", "2026-10-17T12:30:00Z"),
        event("b", "Træning", "2026-10-14T17:00:00Z"),
        event("old", "Vanløse - Swingkings", "2026-09-01T12:00:00Z"),
      ],
      null,
      now,
    );
    expect(first).toMatchObject({ created: 3, updated: 0, tasksAdded: 2 });

    const match = await prisma.match.findFirstOrThrow({ where: { teamId: team.id, externalUid: "a" }, include: { tasks: { include: { assignees: true } } } });
    expect(match).toMatchObject({ kind: "MATCH", opponent: "B.93", isHome: true, source: "KAMPKLAR" });
    // Three jobs-worth of people among three players: everybody gets exactly one.
    const assigned = match.tasks.flatMap((t) => t.assignees.map((a) => a.userId)).sort();
    expect(assigned).toEqual(players.map((p) => p.id).sort());
    // A training and a match in the past get no jobs.
    expect(await prisma.task.count({ where: { teamId: team.id } })).toBe(2);

    const second = await applyCalendar(team.id, team.name, [event("a", "Swingkings - B.93", "2026-10-18T12:30:00Z"), event("b", "Træning", "2026-10-14T17:00:00Z")], null, now);
    expect(second).toMatchObject({ created: 0, updated: 2, cancelled: 0, tasksAdded: 0 });
    expect(await prisma.match.count({ where: { teamId: team.id } })).toBe(3);
    const moved = await prisma.match.findFirstOrThrow({ where: { externalUid: "a" } });
    expect(moved.startsAt.toISOString()).toBe("2026-10-18T12:30:00.000Z");
  });

  it("brings nothing back from before the season began, and still updates what it kept", async () => {
    const team = await makeTeam();
    await applyCalendar(team.id, team.name, [event("kept", "Swingkings - AB", "2026-10-02T12:00:00Z")], null, now);
    await prisma.team.update({ where: { id: team.id }, data: { seasonStartedAt: new Date("2026-10-01T00:00:00Z") } });

    const result = await applyCalendar(
      team.id,
      team.name,
      [
        event("last-season", "Vanløse - Swingkings", "2026-09-20T12:00:00Z"),
        event("kept", "Swingkings - AB", "2026-10-03T12:00:00Z"),
        event("next", "Swingkings - B.93", "2026-10-20T12:00:00Z"),
      ],
      null,
      now,
    );
    expect(result).toMatchObject({ created: 1, updated: 1 });
    expect((await prisma.match.findMany({ where: { teamId: team.id }, select: { externalUid: true }, orderBy: { startsAt: "asc" } })).map((m) => m.externalUid)).toEqual(["kept", "next"]);
  });

  it("marks an upcoming match that left the feed as cancelled, and leaves hand-made ones alone", async () => {
    const team = await makeTeam();
    await prisma.match.create({ data: { teamId: team.id, title: "Pokal", startsAt: new Date("2026-10-30T12:00:00Z") } });
    await applyCalendar(team.id, team.name, [event("x", "Swingkings - AB", "2026-10-20T12:00:00Z")], null, now);
    const result = await applyCalendar(team.id, team.name, [], null, now);
    expect(result.cancelled).toBe(1);
    expect((await prisma.match.findFirstOrThrow({ where: { externalUid: "x" } })).cancelledAt).not.toBeNull();
    expect((await prisma.match.findFirstOrThrow({ where: { title: "Pokal" } })).cancelledAt).toBeNull();
  });

  it("keeps one team's calendar away from another's", async () => {
    const ours = await makeTeam("Swingkings");
    const theirs = await makeTeam("Andet hold");
    await applyCalendar(ours.id, ours.name, [event("same-uid", "Swingkings - AB", "2026-10-20T12:00:00Z")], null, now);
    await applyCalendar(theirs.id, theirs.name, [event("same-uid", "Andet hold - AB", "2026-10-21T12:00:00Z")], null, now);
    expect(await prisma.match.count({ where: { externalUid: "same-uid" } })).toBe(2);
  });

  it("hands out the jobs on new matches without a push, while a job added by hand still sends one", async () => {
    const team = await makeTeam();
    await makeMember(team.id, "Anna");
    await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Tøjvask", people: 1 } });
    process.env.VAPID_PRIVATE_KEY = "test";
    try {
      const result = await applyCalendar(team.id, team.name, [event("ny", "Swingkings - B.93", "2026-10-17T12:30:00Z")], null, now);
      expect(result.tasksAdded).toBe(1);
      expect(afterQueue).toHaveLength(0);

      const match = await prisma.match.create({ data: { teamId: team.id, title: "Pokal", startsAt: new Date("2026-10-30T12:00:00Z") } });
      await addTemplatesToActivity(team.id, match, null, "auto");
      expect(afterQueue).toHaveLength(1);
    } finally {
      delete process.env.VAPID_PRIVATE_KEY;
    }
  });
});

describe("a moved activity", () => {
  afterEach(() => {
    delete process.env.VAPID_PRIVATE_KEY;
    pushed.length = 0;
  });

  async function syncedMatch() {
    const team = await makeTeam("Swingkings");
    const anna = await makeMember(team.id, "Anna");
    const bo = await makeMember(team.id, "Bo");
    await prisma.taskTemplate.create({ data: { teamId: team.id, title: "Tøjvask", people: 1 } });
    await applyCalendar(team.id, team.name, [event("a", "Swingkings - B.93", "2026-10-17T12:30:00Z")], null, now);
    const match = await prisma.match.findFirstOrThrow({ where: { teamId: team.id, externalUid: "a" } });
    return { team, anna, bo, match };
  }

  it("takes its open jobs' deadlines along without telling anybody, and leaves done jobs alone", async () => {
    const { team, anna, bo, match } = await syncedMatch();
    const open = await prisma.task.findFirstOrThrow({ where: { matchId: match.id } });
    await prisma.task.update({ where: { id: open.id }, data: { lastNotifiedAt: now } });
    const done = await prisma.task.create({
      data: { teamId: team.id, matchId: match.id, title: "Frugt", dueAt: new Date("2026-10-16T18:00:00Z"), doneAt: now },
    });
    const loose = await prisma.task.create({ data: { teamId: team.id, matchId: match.id, title: "Bolde" } });
    await runAfter();

    process.env.VAPID_PRIVATE_KEY = "test";
    await applyCalendar(team.id, team.name, [event("a", "Swingkings - B.93", "2026-10-18T10:00:00Z")], anna.id, now);
    await runAfter();

    const moved = await prisma.task.findUniqueOrThrow({ where: { id: open.id } });
    expect(moved.dueAt?.toISOString()).toBe("2026-10-18T10:00:00.000Z");
    expect(moved.lastNotifiedAt).toBeNull();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: done.id } })).dueAt?.toISOString()).toBe("2026-10-16T18:00:00.000Z");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: loose.id } })).dueAt).toBeNull();

    // The sync is silent: the new time is on the activity for whoever looks.
    expect(pushed).toEqual([]);
  });

  it("says nothing when the time is unchanged, the activity is cancelled or it has taken place", async () => {
    const { team } = await syncedMatch();
    await applyCalendar(team.id, team.name, [event("past", "Træning", "2026-10-01T17:00:00Z")], null, now);
    process.env.VAPID_PRIVATE_KEY = "test";

    await applyCalendar(team.id, team.name, [event("a", "Swingkings - B.93", "2026-10-17T12:30:00Z"), event("past", "Træning", "2026-10-02T17:00:00Z")], null, now);
    await applyCalendar(team.id, team.name, [event("a", "Swingkings - B.93", "2026-10-19T12:30:00Z", { cancelled: true })], null, now);
    await runAfter();
    expect(pushed).toEqual([]);
    // The deadline still follows the cancelled match, in case it is played after all.
    expect((await prisma.task.findFirstOrThrow({ where: { teamId: team.id } })).dueAt?.toISOString()).toBe("2026-10-19T12:30:00.000Z");
  });

  it("sends one summary when many activities are moved at once by hand", async () => {
    const team = await makeTeam("Swingkings");
    const anna = await makeMember(team.id, "Anna");
    const count = MAX_SEPARATE_MOVE_PUSHES + 1;
    const moves = Array.from({ length: count }, (_, i) => ({
      id: `t${i}`,
      kind: "TRAINING" as const,
      title: "Træning",
      opponent: null,
      from: new Date(`2026-10-${20 + i}T17:00:00Z`),
      to: new Date(`2026-10-${20 + i}T18:00:00Z`),
    }));
    process.env.VAPID_PRIVATE_KEY = "test";
    await announceActivityMoves(team.id, moves, null);
    await runAfter();
    expect(pushed).toEqual([
      {
        to: [anna.id],
        payload: { title: "Nye tidspunkter 📅", body: `${count} aktiviteter har fået nyt tidspunkt.`, url: "/aktiviteter", tag: "activity-moves" },
      },
    ]);
  });

  it("moves only its own team's jobs", async () => {
    const { team, match } = await syncedMatch();
    const other = await makeTeam("Andet hold");
    // A job on another team pointing at this activity (it cannot happen, but must not move).
    const stray = await prisma.task.create({ data: { teamId: other.id, matchId: match.id, title: "Fremmed", dueAt: match.startsAt } });
    await applyCalendar(team.id, team.name, [event("a", "Swingkings - B.93", "2026-10-18T12:30:00Z")], null, now);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: stray.id } })).dueAt?.toISOString()).toBe("2026-10-17T12:30:00.000Z");
  });
});
