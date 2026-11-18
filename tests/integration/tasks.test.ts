import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTask, deleteTask, updateTask } from "@/app/actions/tasks";
import { isTaskOpen, openTask, taskCandidates } from "@/lib/tasks";
import { teamDb } from "@/lib/team-db";
import { formData, makeMatch, makeMember, makeSquad, signIn } from "../helpers/factories";
import { expectRedirect, expectRedirectToLogin } from "../helpers/expect";

const assignees = async (taskId: string) =>
  (await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } })).map((a) => a.userId).sort();

describe("createTask", () => {
  it("lets any player put a job with its own deadline and the people they pick on an activity", async () => {
    const { team, anna, bo } = await makeSquad();
    const activity = await makeMatch(team.id);
    await signIn(anna);
    expect(
      await createTask(undefined, formData({ title: "Købe bolde", matchId: activity.id, dueOn: "2030-06-07", assign: "pick", assigneeId: [bo.id, anna.id] })),
    ).toEqual({ ok: true });
    const task = await prisma.task.findFirstOrThrow({ where: { teamId: team.id } });
    expect(task).toMatchObject({ title: "Købe bolde", createdById: anna.id, matchId: activity.id });
    // The end of that day, on the team's clock.
    expect(task.dueAt?.toISOString()).toBe("2030-06-07T21:59:59.999Z");
    expect(await assignees(task.id)).toEqual([anna.id, bo.id].sort());
  });

  it("takes the kick-off as the deadline of a match job, and hands it out fairly when asked", async () => {
    const { team, anna, bo, admin, treasurer } = await makeSquad();
    const match = await makeMatch(team.id);
    // Bo has done a job recently, so the three others go before him.
    await prisma.task.create({ data: { teamId: team.id, title: "Før", assignees: { create: { userId: bo.id } } } });
    await signIn(anna);
    await createTask(undefined, formData({ title: "Kørsel", matchId: match.id, assign: "auto", people: "3" }));
    const task = await prisma.task.findFirstOrThrow({ where: { title: "Kørsel" } });
    expect(task.dueAt).toEqual(match.startsAt);
    expect(await assignees(task.id)).toEqual([admin.id, anna.id, treasurer.id].sort());
  });

  it("leaves a job open for somebody to take", async () => {
    const { team, anna } = await makeSquad();
    const activity = await makeMatch(team.id);
    await signIn(anna);
    await createTask(undefined, formData({ title: "Kage", matchId: activity.id, assign: "none", assigneeId: anna.id }));
    expect(await assignees((await prisma.task.findFirstOrThrow()).id)).toEqual([]);
  });

  it("refuses a job on no activity, a bad date, a stranger and another team's activity", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const activity = await makeMatch(team.id);
    await signIn(anna);
    const make = (fields: Record<string, string | string[]>) => createTask(undefined, formData({ title: "X", matchId: activity.id, ...fields }));
    expect(await createTask(undefined, formData({ title: "X", matchId: "", dueOn: "2030-06-07" }))).toEqual({ ok: false, error: "Vælg aktiviteten, opgaven hører til." });
    expect(await make({ dueOn: "2030-02-30" })).toEqual({ ok: false, error: "Fristen kunne ikke læses." });
    expect(await make({ dueOn: "2030-06-07", assigneeId: other.anna.id })).toEqual({ ok: false, error: "En af de valgte er ikke på holdet." });
    expect(await make({ matchId: (await makeMatch(other.team.id)).id })).toEqual({ ok: false, error: "Aktiviteten findes ikke." });
    expect(await make({ title: "", dueOn: "2030-06-07" })).toEqual({ ok: false, error: "Giv opgaven et navn." });
    expect(await prisma.task.count()).toBe(0);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => createTask(undefined, formData({ title: "X" })));
  });
});

describe("editing and deleting", () => {
  async function jobBy(creator: { id: string }, teamId: string, matchId: string | null = null) {
    return prisma.task.create({
      data: { teamId, title: "Tøjvask", dueAt: new Date("2030-06-07T10:00:00Z"), matchId, createdById: creator.id },
    });
  }

  it("lets the maker change title, deadline and people", async () => {
    const { team, anna, bo, treasurer } = await makeSquad();
    const task = await jobBy(anna, team.id);
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: treasurer.id } });
    await signIn(anna);
    expect(await updateTask(undefined, formData({ id: task.id, title: "Vask trøjer", dueOn: "2030-06-08", assigneeId: [bo.id] }))).toEqual({ ok: true });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ title: "Vask trøjer" });
    expect(await assignees(task.id)).toEqual([bo.id]);
  });

  it("lets an admin edit anybody's job but not another player", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const task = await jobBy(anna, team.id);
    await signIn(bo);
    expect(await updateTask(undefined, formData({ id: task.id, title: "Mit nu", dueOn: "2030-06-08" }))).toEqual({ ok: false, error: "Du kan ikke rette den opgave." });
    expect(await deleteTask(undefined, formData({ id: task.id }))).toEqual({ ok: false, error: "Du kan ikke slette den opgave." });
    await signIn(admin);
    expect(await updateTask(undefined, formData({ id: task.id, title: "Admin", dueOn: "2030-06-08" }))).toEqual({ ok: true });
  });

  it("keeps a deadline on a job with no match, and refuses people from elsewhere", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const task = await jobBy(anna, team.id);
    await signIn(anna);
    expect(await updateTask(undefined, formData({ id: task.id, title: "X" }))).toEqual({ ok: false, error: "En opgave uden aktivitet skal have en frist." });
    expect(await updateTask(undefined, formData({ id: task.id, title: "X", dueOn: "nej" }))).toEqual({ ok: false, error: "Fristen kunne ikke læses." });
    expect(await updateTask(undefined, formData({ id: task.id, title: "X", dueOn: "2030-06-08", assigneeId: other.bo.id }))).toEqual({
      ok: false,
      error: "En af de valgte er ikke på holdet.",
    });
  });

  it("deletes a job on an activity where it stands (its sheet goes with it), and an old one goes to the front page", async () => {
    const { team, anna } = await makeSquad();
    const match = await makeMatch(team.id);
    const onMatch = await jobBy(anna, team.id, match.id);
    const alone = await jobBy(anna, team.id);
    await signIn(anna);
    // A match job keeps its kick-off when no new date is given.
    expect(await updateTask(undefined, formData({ id: onMatch.id, title: "Kørsel" }))).toEqual({ ok: true });
    expect(await deleteTask(undefined, formData({ id: onMatch.id }))).toEqual({ ok: true });
    await expectRedirect(() => deleteTask(undefined, formData({ id: alone.id })), "/oversigt");
    expect(await prisma.task.count()).toBe(0);
  });
});

describe("when a job is done", () => {
  // Nobody ticks a job off: it is done once its activity's day is over.
  const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

  it("counts a job open until its activity's day is over, and one without an activity until its deadline's", async () => {
    const { team } = await makeSquad();
    const activity = (days: number) => prisma.match.create({ data: { teamId: team.id, kind: "MATCH", title: "Kamp", startsAt: daysFromNow(days) } });
    const [past, today, coming] = await Promise.all([activity(-2), activity(0), activity(3)]);
    const job = (title: string, data: { matchId?: string; dueAt?: Date; doneAt?: Date }) =>
      prisma.task.create({ data: { teamId: team.id, title, ...data } });
    await job("Efter kampen i forgårs", { matchId: past.id });
    await job("Kampen i dag", { matchId: today.id });
    await job("Kampen om tre dage", { matchId: coming.id });
    await job("Frist i morgen", { dueAt: daysFromNow(1) });
    await job("Frist i forgårs", { dueAt: daysFromNow(-2) });
    await job("Ingen frist", {});
    // Ticked off back when that could be done: still done.
    await job("Krydset af", { matchId: coming.id, doneAt: new Date() });

    const open = await teamDb(team.id).task.findMany({ where: openTask(), orderBy: { title: "asc" } });
    expect(open.map((t) => t.title)).toEqual(["Frist i morgen", "Ingen frist", "Kampen i dag", "Kampen om tre dage"]);
    const all = await teamDb(team.id).task.findMany({ include: { match: { select: { startsAt: true } } } });
    for (const task of all) expect(isTaskOpen(task)).toBe(open.some((o) => o.id === task.id));
  });

  it("cannot touch another team's job", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.task.create({ data: { teamId: other.team.id, title: "Deres" } });
    await signIn(anna);
    expect(await updateTask(undefined, formData({ id: theirs.id, title: "X", dueOn: "2030-01-01" }))).toEqual({ ok: false, error: "Du kan ikke rette den opgave." });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ doneAt: null, title: "Deres" });
    expect(await assignees(theirs.id)).toEqual([]);
  });
});

describe("taskCandidates", () => {
  it("counts the last year's jobs on this team only, and skips those who take no jobs", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    await makeMember(team.id, "Coach", "ADMIN", { takesTasks: false });
    const year = 365 * 86_400_000;
    await prisma.task.create({ data: { teamId: team.id, title: "Nu", assignees: { create: { userId: anna.id } } } });
    await prisma.task.create({ data: { teamId: team.id, title: "Gammel", createdAt: new Date(Date.now() - year - 86_400_000), assignees: { create: { userId: bo.id } } } });
    await prisma.teamMember.create({ data: { teamId: other.team.id, userId: anna.id } });
    await prisma.task.create({ data: { teamId: other.team.id, title: "Andet hold", assignees: { create: { userId: anna.id } } } });

    const candidates = await taskCandidates(team.id);
    expect(candidates).toHaveLength(4);
    expect(candidates.find((c) => c.userId === anna.id)?.load).toBe(1);
    expect(candidates.find((c) => c.userId === bo.id)?.load).toBe(0);
  });
});
