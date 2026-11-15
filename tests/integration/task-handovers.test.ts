import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { answerHandover, offerTask, setTaskDone, toggleTakeTask, updateTask, withdrawHandover } from "@/app/actions/tasks";
import { formData, makeMatch, makeSquad, signIn } from "../helpers/factories";
import { expectRedirectToLogin } from "../helpers/expect";

const assignees = async (taskId: string) =>
  (await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } })).map((a) => a.userId).sort();

/** A job on a match that Anna has. */
async function annasJob() {
  const squad = await makeSquad();
  const match = await makeMatch(squad.team.id);
  const task = await prisma.task.create({
    data: {
      teamId: squad.team.id,
      title: "Tøjvask",
      matchId: match.id,
      createdById: squad.admin.id,
      assignees: { create: { userId: squad.anna.id } },
    },
  });
  return { ...squad, task };
}

const offer = (taskId: string, toId: string, note?: string) => offerTask(undefined, formData({ id: taskId, toId, note }));
const answer = (id: string, answer: "accept" | "decline") => answerHandover(undefined, formData({ id, answer }));

describe("offerTask", () => {
  it("asks somebody to take over, and nothing moves until they answer", async () => {
    const { team, anna, bo, task } = await annasJob();
    await signIn(anna);
    expect(await offer(task.id, bo.id, "Jeg er ikke med til kampen")).toEqual({ ok: true });
    expect(await prisma.taskHandover.findFirstOrThrow()).toMatchObject({
      teamId: team.id,
      taskId: task.id,
      fromId: anna.id,
      toId: bo.id,
      note: "Jeg er ikke med til kampen",
      status: "PENDING",
      answeredAt: null,
    });
    expect(await assignees(task.id)).toEqual([anna.id]);
  });

  it("asks once: a second request while one waits is refused", async () => {
    const { anna, bo, treasurer, task } = await annasJob();
    await signIn(anna);
    await offer(task.id, bo.id);
    expect(await offer(task.id, treasurer.id)).toEqual({
      ok: false,
      error: "Du venter allerede på svar på opgaven. Træk den forespørgsel tilbage først.",
    });
    expect(await prisma.taskHandover.count()).toBe(1);
  });

  it("refuses somebody who does not have the job, oneself, a person who has it already and a stranger", async () => {
    const { team, anna, bo, treasurer, task } = await annasJob();
    const other = await makeSquad("Andre");
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: treasurer.id } });

    await signIn(bo);
    expect(await offer(task.id, anna.id)).toEqual({ ok: false, error: "Du kan kun give en opgave videre, du selv har." });

    await signIn(anna);
    expect(await offer(task.id, anna.id)).toEqual({ ok: false, error: "Vælg en anden end dig selv." });
    expect(await offer(task.id, treasurer.id)).toEqual({ ok: false, error: "Kasserer har allerede opgaven." });
    expect(await offer(task.id, other.anna.id)).toEqual({ ok: false, error: "Den valgte er ikke på holdet." });
    expect(await offer(task.id, "")).toEqual({ ok: false, error: "Vælg hvem der skal overtage opgaven." });

    await prisma.task.update({ where: { id: task.id }, data: { doneAt: new Date() } });
    expect(await offer(task.id, bo.id)).toEqual({ ok: false, error: "Opgaven er allerede udført." });
    expect(await prisma.taskHandover.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("treats another team's task as not found", async () => {
    const { task } = await annasJob();
    const other = await makeSquad("Andre");
    await signIn(other.anna);
    expect(await offer(task.id, other.bo.id)).toEqual({ ok: false, error: "Opgaven findes ikke." });
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => offer("x", "y"));
  });
});

describe("answerHandover", () => {
  async function asked() {
    const job = await annasJob();
    await signIn(job.anna);
    await offer(job.task.id, job.bo.id);
    const handover = await prisma.taskHandover.findFirstOrThrow();
    return { ...job, handover };
  }

  it("moves the place on the job when the one asked accepts, once however often they press", async () => {
    const { anna, bo, task, handover } = await asked();
    await signIn(bo);
    expect(await answer(handover.id, "accept")).toEqual({ ok: true });
    expect(await assignees(task.id)).toEqual([bo.id]);
    expect(await prisma.taskHandover.findUniqueOrThrow({ where: { id: handover.id } })).toMatchObject({ status: "ACCEPTED" });
    expect((await prisma.taskHandover.findUniqueOrThrow({ where: { id: handover.id } })).answeredAt).not.toBeNull();

    expect(await answer(handover.id, "accept")).toEqual({ ok: false, error: "Forespørgslen er allerede besvaret." });
    expect(await answer(handover.id, "decline")).toEqual({ ok: false, error: "Forespørgslen er allerede besvaret." });
    expect(await assignees(task.id)).toEqual([bo.id]);

    // Anna may ask again once it is answered; it is Bo's job now, so she cannot.
    await signIn(anna);
    expect(await offer(task.id, bo.id)).toEqual({ ok: false, error: "Du kan kun give en opgave videre, du selv har." });
  });

  it("leaves the job with the asker when declined, and lets them ask somebody else", async () => {
    const { anna, bo, treasurer, task, handover } = await asked();
    await signIn(bo);
    expect(await answer(handover.id, "decline")).toEqual({ ok: true });
    expect(await assignees(task.id)).toEqual([anna.id]);
    expect(await prisma.taskHandover.findUniqueOrThrow({ where: { id: handover.id } })).toMatchObject({ status: "DECLINED" });

    await signIn(anna);
    expect(await offer(task.id, treasurer.id)).toEqual({ ok: true });
    expect(await prisma.taskHandover.count({ where: { taskId: task.id } })).toBe(2);
  });

  it("only lets the one asked answer", async () => {
    const { anna, admin, task, handover } = await asked();
    for (const who of [anna, admin]) {
      await signIn(who);
      expect(await answer(handover.id, "accept")).toEqual({ ok: false, error: "Det er ikke dig, der er spurgt." });
    }
    expect(await assignees(task.id)).toEqual([anna.id]);
  });

  it("refuses a job already done, and one the asker has meanwhile left", async () => {
    const { anna, bo, task, handover } = await asked();
    await prisma.task.update({ where: { id: task.id }, data: { doneAt: new Date() } });
    await signIn(bo);
    expect(await answer(handover.id, "accept")).toEqual({ ok: false, error: "Opgaven er allerede udført." });

    await prisma.task.update({ where: { id: task.id }, data: { doneAt: null } });
    // Taken off by hand, behind the request's back.
    await prisma.taskAssignee.deleteMany({ where: { taskId: task.id, userId: anna.id } });
    expect(await answer(handover.id, "accept")).toEqual({ ok: false, error: "Anna har ikke længere opgaven." });
    expect(await assignees(task.id)).toEqual([]);
    expect(await prisma.taskHandover.findUniqueOrThrow({ where: { id: handover.id } })).toMatchObject({ status: "WITHDRAWN" });
  });

  it("treats another team's request as not found", async () => {
    const { handover } = await asked();
    const other = await makeSquad("Andre");
    await signIn(other.bo);
    expect(await answer(handover.id, "accept")).toEqual({ ok: false, error: "Forespørgslen findes ikke." });
  });
});

describe("withdrawing", () => {
  it("lets the asker take the request back, and nobody else", async () => {
    const { anna, bo, admin, task } = await annasJob();
    await signIn(anna);
    await offer(task.id, bo.id);
    const handover = await prisma.taskHandover.findFirstOrThrow();

    for (const who of [bo, admin]) {
      await signIn(who);
      expect(await withdrawHandover(undefined, formData({ id: handover.id }))).toEqual({
        ok: false,
        error: "Kun den, der spurgte, kan trække forespørgslen tilbage.",
      });
    }
    await signIn(anna);
    expect(await withdrawHandover(undefined, formData({ id: handover.id }))).toEqual({ ok: true });
    expect(await prisma.taskHandover.findUniqueOrThrow({ where: { id: handover.id } })).toMatchObject({ status: "WITHDRAWN" });
    expect(await withdrawHandover(undefined, formData({ id: handover.id }))).toEqual({ ok: false, error: "Forespørgslen er allerede besvaret." });

    await signIn(bo);
    expect(await answer(handover.id, "accept")).toEqual({ ok: false, error: "Forespørgslen er allerede besvaret." });
    expect(await assignees(task.id)).toEqual([anna.id]);
  });

  it("treats another team's request as not found", async () => {
    const { anna, bo, task } = await annasJob();
    await signIn(anna);
    await offer(task.id, bo.id);
    const other = await makeSquad("Andre");
    await signIn(other.anna);
    expect(await withdrawHandover(undefined, formData({ id: (await prisma.taskHandover.findFirstOrThrow()).id }))).toEqual({
      ok: false,
      error: "Forespørgslen findes ikke.",
    });
  });

  it("withdraws the request when the asker leaves the job or is taken off it", async () => {
    const { anna, bo, treasurer, admin, task } = await annasJob();
    await signIn(anna);
    await offer(task.id, bo.id);
    await toggleTakeTask(undefined, formData({ id: task.id }));
    expect(await prisma.taskHandover.findFirstOrThrow()).toMatchObject({ status: "WITHDRAWN" });

    await toggleTakeTask(undefined, formData({ id: task.id }));
    await offer(task.id, treasurer.id);
    await signIn(admin);
    await updateTask(undefined, formData({ id: task.id, title: "Tøjvask", assigneeId: [bo.id] }));
    expect(await prisma.taskHandover.count({ where: { status: "PENDING" } })).toBe(0);
  });

  it("keeps a done job's requests as history", async () => {
    const { anna, bo, task } = await annasJob();
    await signIn(anna);
    await offer(task.id, bo.id);
    await setTaskDone(undefined, formData({ id: task.id, done: "true" }));
    expect(await prisma.taskHandover.count({ where: { taskId: task.id } })).toBe(1);
  });
});
