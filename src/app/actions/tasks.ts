"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalId, optionalText, readForm, requiredText } from "@/lib/form";
import { deadlineOn } from "@/lib/time";
import { createDistributedTasks } from "@/lib/tasks";
import { notifyLater } from "@/lib/notify";

function refresh(taskId?: string, matchId?: string | null) {
  revalidatePath("/opgaver", "layout");
  revalidatePath("/oversigt");
  if (taskId) revalidatePath(`/opgaver/${taskId}`);
  if (matchId) revalidatePath(`/kampe/${matchId}`);
}

const taskSchema = z.object({
  title: requiredText("Giv opgaven et navn."),
  description: optionalText,
  matchId: optionalId,
  dueOn: z.string().trim().optional(),
  /** "auto" hands it out fairly, "pick" uses the ticked people, "none" leaves it open. */
  assign: z.enum(["auto", "pick", "none"]).default("pick"),
  people: z.coerce.number().int().min(1).max(20).default(1),
});

/**
 * A job tied to a match (its deadline is the kick-off unless given one), or standing
 * alone with a deadline of its own. Anybody on the team can create one; handing it out
 * is either picking people or letting the app pick fairly.
 */
export async function createTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(taskSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);

  let match: { id: string; startsAt: Date } | null = null;
  if (form.fields.matchId) {
    match = await db.match.findFirst({ where: { id: form.fields.matchId }, select: { id: true, startsAt: true } });
    if (!match) return fail("Kampen findes ikke.");
  }
  let dueAt: Date | null = match?.startsAt ?? null;
  if (form.fields.dueOn) {
    dueAt = deadlineOn(form.fields.dueOn);
    if (!dueAt) return fail("Fristen kunne ikke læses.");
  }
  if (!match && !dueAt) return fail("Giv opgaven en frist, eller knyt den til en kamp.");

  const job = {
    title: form.fields.title,
    description: form.fields.description,
    matchId: match?.id ?? null,
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
      url: `/opgaver/${task.id}`,
      tag: `task-${task.id}`,
    });
  }
  refresh(taskId, match?.id);
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
    return fail("En opgave uden kamp skal have en frist.");
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
  ]);
  const added = picked.filter((id) => !before.some((b) => b.userId === id));
  notifyLater(added, user.id, {
    title: `Ny opgave: ${form.fields.title}`,
    body: `${user.name} har givet dig en opgave.`,
    url: `/opgaver/${task.id}`,
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
  if (mine) await prisma.taskAssignee.delete({ where: { taskId_userId: { taskId: id, userId: user.id } } });
  else await prisma.taskAssignee.create({ data: { taskId: id, userId: user.id } });
  refresh(task.id, task.matchId);
  return ok();
}

export async function deleteTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const task = await editable(user, String(formData.get("id") ?? ""));
  if (!task) return fail("Du kan ikke slette den opgave.");
  await teamDb(user.teamId).task.deleteMany({ where: { id: task.id } });
  refresh(undefined, task.matchId);
  redirect(task.matchId ? `/kampe/${task.matchId}` : "/opgaver");
}
