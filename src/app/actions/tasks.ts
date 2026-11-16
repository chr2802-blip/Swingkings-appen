"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalText, readForm, requiredText } from "@/lib/form";
import { deadlineOn } from "@/lib/time";
import { createDistributedTasks, taskUrl } from "@/lib/tasks";
import { notifyLater } from "@/lib/notify";

function refresh(taskId?: string, matchId?: string | null) {
  revalidatePath("/opgaver", "layout");
  revalidatePath("/aktiviteter");
  revalidatePath("/oversigt");
  if (taskId) revalidatePath(`/opgaver/${taskId}`);
  // The activity and its tabs (`/opgaver`, `/boder`) under it.
  if (matchId) revalidatePath(`/aktiviteter/${matchId}`, "layout");
}

const taskSchema = z.object({
  title: requiredText("Giv opgaven et navn."),
  description: optionalText,
  matchId: z.string().trim().min(1, "Vælg aktiviteten, opgaven hører til.").max(64),
  dueOn: z.string().trim().optional(),
  /** "auto" hands it out fairly, "pick" uses the ticked people, "none" leaves it open. */
  assign: z.enum(["auto", "pick", "none"]).default("pick"),
  people: z.coerce.number().int().min(1).max(20).default(1),
});

/**
 * A job on an activity; its deadline is the activity's start unless given one. Anybody
 * on the team can create one; handing it out is either picking people or letting the
 * app pick fairly.
 */
export async function createTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(taskSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);

  const match = await db.match.findFirst({ where: { id: form.fields.matchId }, select: { id: true, startsAt: true } });
  if (!match) return fail("Aktiviteten findes ikke.");
  let dueAt: Date | null = match.startsAt;
  if (form.fields.dueOn) {
    dueAt = deadlineOn(form.fields.dueOn);
    if (!dueAt) return fail("Fristen kunne ikke læses.");
  }

  const job = {
    title: form.fields.title,
    description: form.fields.description,
    matchId: match.id,
    dueAt,
    people: form.fields.people,
  };

  let taskId: string;
  if (form.fields.assign === "auto") {
    const [task] = await createDistributedTasks(user.teamId, [job], user.id);
    taskId = task!.id;
  } else {
    const picked = form.fields.assign === "pick" ? [...new Set(formData.getAll("assigneeId").map(String))] : [];
    const members = await db.teamMember.findMany({ where: { userId: { in: picked } }, select: { userId: true } });
    if (members.length !== picked.length) return fail("En af de valgte er ikke på holdet.");
    const { people: _people, ...data } = job;
    void _people;
    const task = await db.task.create({
      data: { ...data, teamId: user.teamId, createdById: user.id, assignees: { create: picked.map((userId) => ({ userId })) } },
    });
    taskId = task.id;
    notifyLater(picked, user.id, {
      title: `Ny opgave: ${task.title}`,
      body: `${user.name} har givet dig en opgave.`,
      url: taskUrl(task),
      tag: `task-${task.id}`,
    });
  }
  refresh(taskId, match.id);
  return ok();
}

const editSchema = z.object({
  id: z.string().min(1),
  title: requiredText("Giv opgaven et navn."),
  description: optionalText,
  dueOn: z.string().trim().optional(),
});

/** Who may edit: whoever made it, and the team's admins. */
async function editable(user: Awaited<ReturnType<typeof requireTeamUser>>, id: string) {
  const task = await teamDb(user.teamId).task.findFirst({ where: { id } });
  if (!task) return null;
  if (task.createdById !== user.id && !canAdministerTeam(user, user.teamId)) return null;
  return task;
}

export async function updateTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(editSchema, formData);
  if (!form.ok) return fail(form.error);
  const task = await editable(user, form.fields.id);
  if (!task) return fail("Du kan ikke rette den opgave.");
  let dueAt = task.dueAt;
  if (form.fields.dueOn) {
    dueAt = deadlineOn(form.fields.dueOn);
    if (!dueAt) return fail("Fristen kunne ikke læses.");
  } else if (!task.matchId) {
    return fail("En opgave uden aktivitet skal have en frist.");
  }
  const picked = [...new Set(formData.getAll("assigneeId").map(String))];
  const db = teamDb(user.teamId);
  const members = await db.teamMember.findMany({ where: { userId: { in: picked } }, select: { userId: true } });
  if (members.length !== picked.length) return fail("En af de valgte er ikke på holdet.");

  const before = await prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } });
  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { title: form.fields.title, description: form.fields.description, dueAt },
    }),
    prisma.taskAssignee.deleteMany({ where: { taskId: task.id, userId: { notIn: picked } } }),
    prisma.taskAssignee.createMany({
      data: picked.map((userId) => ({ taskId: task.id, userId })),
      skipDuplicates: true,
    }),
    // Whoever was taken off the job has nothing left to hand over.
    prisma.taskHandover.updateMany({
      where: { taskId: task.id, fromId: { notIn: picked }, status: "PENDING" },
      data: { status: "WITHDRAWN", answeredAt: new Date() },
    }),
  ]);
  const added = picked.filter((id) => !before.some((b) => b.userId === id));
  notifyLater(added, user.id, {
    title: `Ny opgave: ${form.fields.title}`,
    body: `${user.name} har givet dig en opgave.`,
    url: taskUrl(task),
    tag: `task-${task.id}`,
  });
  refresh(task.id, task.matchId);
  return ok();
}

/** Anybody on the team may mark a job done (or undo it): the kit gets washed by whoever has it. */
export async function setTaskDone(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = String(formData.get("id") ?? "");
  const done = formData.get("done") === "true";
  const db = teamDb(user.teamId);
  const task = await db.task.findFirst({ where: { id }, select: { id: true, matchId: true } });
  if (!task) return fail("Opgaven findes ikke.");
  await db.task.updateMany({
    where: { id },
    data: done ? { doneAt: new Date(), doneById: user.id } : { doneAt: null, doneById: null },
  });
  refresh(task.id, task.matchId);
  return ok();
}

/** Puts yourself on a job, or takes yourself off one. */
export async function toggleTakeTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = String(formData.get("id") ?? "");
  const task = await teamDb(user.teamId).task.findFirst({ where: { id }, select: { id: true, matchId: true } });
  if (!task) return fail("Opgaven findes ikke.");
  const mine = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId: id, userId: user.id } } });
  if (mine) {
    await prisma.$transaction([
      prisma.taskAssignee.delete({ where: { taskId_userId: { taskId: id, userId: user.id } } }),
      // Nobody can take over a place that is no longer there.
      prisma.taskHandover.updateMany({
        where: { taskId: id, fromId: user.id, status: "PENDING" },
        data: { status: "WITHDRAWN", answeredAt: new Date() },
      }),
    ]);
  } else await prisma.taskAssignee.create({ data: { taskId: id, userId: user.id } });
  refresh(task.id, task.matchId);
  return ok();
}

export async function deleteTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const task = await editable(user, String(formData.get("id") ?? ""));
  if (!task) return fail("Du kan ikke slette den opgave.");
  await teamDb(user.teamId).task.deleteMany({ where: { id: task.id } });
  refresh(undefined, task.matchId);
  redirect(task.matchId ? `/aktiviteter/${task.matchId}` : "/oversigt");
}

const offerSchema = z.object({
  id: z.string().min(1),
  toId: z.string().trim().min(1, "Vælg hvem der skal overtage opgaven."),
  note: optionalText,
});

/**
 * Asks somebody else to take over your place on a job — you cannot make the match, say.
 * Nothing moves until they accept (`answerHandover`); the request stays as the task's
 * history either way.
 */
export async function offerTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(offerSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);
  const task = await db.task.findFirst({
    where: { id: form.fields.id },
    select: { id: true, title: true, matchId: true, doneAt: true, assignees: { select: { userId: true } } },
  });
  if (!task) return fail("Opgaven findes ikke.");
  if (task.doneAt) return fail("Opgaven er allerede udført.");
  if (!task.assignees.some((a) => a.userId === user.id)) return fail("Du kan kun give en opgave videre, du selv har.");
  const { toId } = form.fields;
  if (toId === user.id) return fail("Vælg en anden end dig selv.");
  const to = await db.teamMember.findFirst({ where: { userId: toId }, select: { user: { select: { name: true } } } });
  if (!to) return fail("Den valgte er ikke på holdet.");
  if (task.assignees.some((a) => a.userId === toId)) return fail(`${to.user.name} har allerede opgaven.`);

  try {
    await db.taskHandover.create({
      data: { teamId: user.teamId, taskId: task.id, fromId: user.id, toId, note: form.fields.note },
    });
  } catch (error) {
    // The partial unique index: one open request per person per task.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Du venter allerede på svar på opgaven. Træk den forespørgsel tilbage først.");
    }
    throw error;
  }
  notifyLater([toId], user.id, {
    title: `Vil du overtage: ${task.title}?`,
    body: `${user.name} spørger, om du kan tage opgaven.`,
    url: `/opgaver/${task.id}`,
    tag: `handover-${task.id}`,
  });
  refresh(task.id, task.matchId);
  return ok();
}

/**
 * The person asked says yes or no. Yes moves the place on the job from the asker to
 * them; the status guard means a double press moves it once.
 */
export async function answerHandover(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = String(formData.get("id") ?? "");
  const accept = formData.get("answer") === "accept";
  const db = teamDb(user.teamId);
  const handover = await db.taskHandover.findFirst({
    where: { id },
    include: {
      task: { select: { id: true, title: true, matchId: true, doneAt: true } },
      from: { select: { name: true } },
    },
  });
  if (!handover) return fail("Forespørgslen findes ikke.");
  if (handover.toId !== user.id) return fail("Det er ikke dig, der er spurgt.");
  if (handover.status !== "PENDING") return fail("Forespørgslen er allerede besvaret.");
  if (accept && handover.task.doneAt) return fail("Opgaven er allerede udført.");

  const outcome = await prisma.$transaction(async (tx) => {
    const now = new Date();
    if (!accept) {
      const { count } = await tx.taskHandover.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "DECLINED", answeredAt: now },
      });
      return count === 1 ? "declined" : "answered";
    }
    const { count } = await tx.taskHandover.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "ACCEPTED", answeredAt: now },
    });
    if (count !== 1) return "answered";
    const gone = await tx.taskAssignee.deleteMany({ where: { taskId: handover.taskId, userId: handover.fromId } });
    if (gone.count !== 1) {
      await tx.taskHandover.update({ where: { id }, data: { status: "WITHDRAWN" } });
      return "moot";
    }
    await tx.taskAssignee.createMany({ data: [{ taskId: handover.taskId, userId: user.id }], skipDuplicates: true });
    return "accepted";
  });
  if (outcome === "answered") return fail("Forespørgslen er allerede besvaret.");
  if (outcome === "moot") {
    refresh(handover.task.id, handover.task.matchId);
    return fail(`${handover.from.name} har ikke længere opgaven.`);
  }
  notifyLater([handover.fromId], user.id, {
    title: outcome === "accepted" ? `${user.name} har overtaget: ${handover.task.title}` : `${user.name} kan ikke tage: ${handover.task.title}`,
    body: outcome === "accepted" ? "Du er taget af opgaven." : "Du har stadig opgaven. Spørg en anden.",
    url: `/opgaver/${handover.task.id}`,
    tag: `handover-${handover.task.id}`,
  });
  refresh(handover.task.id, handover.task.matchId);
  return ok();
}

/** The asker takes the request back while it is still unanswered. */
export async function withdrawHandover(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = String(formData.get("id") ?? "");
  const db = teamDb(user.teamId);
  const handover = await db.taskHandover.findFirst({ where: { id }, include: { task: { select: { id: true, matchId: true } } } });
  if (!handover) return fail("Forespørgslen findes ikke.");
  if (handover.fromId !== user.id) return fail("Kun den, der spurgte, kan trække forespørgslen tilbage.");
  const { count } = await db.taskHandover.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "WITHDRAWN", answeredAt: new Date() },
  });
  if (count !== 1) return fail("Forespørgslen er allerede besvaret.");
  refresh(handover.task.id, handover.task.matchId);
  return ok();
}
