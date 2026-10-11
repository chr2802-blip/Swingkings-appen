import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyCalendar } from "@/lib/kampklar";
import type { CalendarEvent } from "@/lib/ical";
import { makeMember, makeTeam } from "./factory";

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
});
