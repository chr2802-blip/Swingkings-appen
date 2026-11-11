import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addTemplatesToActivity, copyTasksFromActivity } from "@/lib/tasks";
import { makeMember, makeTeam } from "./factory";

const day = (d: number, h = 12) => new Date(Date.UTC(2026, 10, d, h));

async function activity(teamId: string, title: string, startsAt: Date) {
  return prisma.match.create({ data: { teamId, kind: "OTHER", title, startsAt }, select: { id: true, startsAt: true } });
}

describe("standard jobs on an activity", () => {
  it("adds only the ticked templates, and only the team's own", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andet hold");
    await makeMember(team.id, "Anna");
    const [wash, chalk] = await Promise.all([
      prisma.taskTemplate.create({ data: { teamId: team.id, title: "Trøjevask" } }),
      prisma.taskTemplate.create({ data: { teamId: team.id, title: "Opkridtning", autoAdd: false } }),
    ]);
    const theirs = await prisma.taskTemplate.create({ data: { teamId: other.id, title: "Deres opgave" } });
    const party = await activity(team.id, "Afslutningsfest", day(20));

    const tasks = await addTemplatesToActivity(team.id, party, null, [chalk.id, theirs.id]);
    expect(tasks.map((t) => t.title)).toEqual(["Opkridtning"]);
    expect(await addTemplatesToActivity(team.id, party, null, [])).toEqual([]);

    const auto = await addTemplatesToActivity(team.id, party, null, "auto");
    expect(auto.map((t) => t.title)).toEqual([wash.title]);
    const rows = await prisma.task.findMany({ where: { matchId: party.id } });
    expect(rows.every((t) => t.dueAt?.getTime() === party.startsAt.getTime())).toBe(true);
  });
});

describe("copyTasksFromActivity", () => {
  it("copies titles, head-counts and deadlines relative to the start, handed out afresh", async () => {
    const team = await makeTeam();
    const [anna, bo, carl] = await Promise.all(["Anna", "Bo", "Carl"].map((n) => makeMember(team.id, n)));
    const lastYear = await activity(team.id, "Afslutningsfest 2025", day(1));
    await prisma.task.create({
      data: {
        teamId: team.id,
        matchId: lastYear.id,
        title: "Bestil lokale",
        description: "Ring til klubhuset",
        dueAt: day(1, 12 - 48), // two days before
        doneAt: day(1),
        assignees: { create: [{ userId: anna!.id }, { userId: bo!.id }] },
      },
    });
    await prisma.task.create({ data: { teamId: team.id, matchId: lastYear.id, title: "Køb ind", dueAt: null } });

    const thisYear = await activity(team.id, "Afslutningsfest 2026", day(25));
    const copies = await copyTasksFromActivity(team.id, lastYear.id, thisYear, carl!.id);
    expect(copies).toHaveLength(2);

    const rows = await prisma.task.findMany({
      where: { matchId: thisYear.id },
      orderBy: { createdAt: "asc" },
      include: { assignees: true },
    });
    expect(rows.map((t) => t.title)).toEqual(["Bestil lokale", "Køb ind"]);
    expect(rows[0]).toMatchObject({ description: "Ring til klubhuset", doneAt: null, createdById: carl!.id });
    expect(rows[0]!.dueAt!.toISOString()).toBe(day(25, 12 - 48).toISOString());
    expect(rows[1]!.dueAt!.toISOString()).toBe(thisYear.startsAt.toISOString());
    // Two people as before, one for the job nobody had — chosen by the fair distribution,
    // so Carl, who had nothing, is among them.
    expect(rows[0]!.assignees).toHaveLength(2);
    expect(rows[1]!.assignees).toHaveLength(1);
    expect(rows.flatMap((t) => t.assignees.map((a) => a.userId))).toContain(carl!.id);
  });

  it("copies nothing from another team's activity, or from itself", async () => {
    const ours = await makeTeam();
    const theirs = await makeTeam("Andet hold");
    const foreign = await activity(theirs.id, "Deres fest", day(1));
    await prisma.task.create({ data: { teamId: theirs.id, matchId: foreign.id, title: "Hemmelig opgave" } });
    const target = await activity(ours.id, "Vores fest", day(20));
    expect(await copyTasksFromActivity(ours.id, foreign.id, target, null)).toEqual([]);
    expect(await copyTasksFromActivity(theirs.id, foreign.id, foreign, null)).toEqual([]);
    expect(await prisma.task.count({ where: { matchId: target.id } })).toBe(0);
  });
});
