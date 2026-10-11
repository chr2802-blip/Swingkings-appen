"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { MAX_MESSAGE } from "@/lib/form";
import { readPhotoChoice, discardPhoto } from "@/lib/photos";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { announce } from "@/lib/realtime";
import { CHAT_POSTED } from "@/lib/realtime-topic";
import { notifyLater } from "@/lib/notify";

const body = z.string().trim().max(MAX_MESSAGE).optional().transform((v) => v || null);

/* ── Chat ───────────────────────────────────────────────────────────────────────── */

export async function sendChatMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Beskeden er for lang (højst ${MAX_MESSAGE} tegn).`);
  const photo = await readPhotoChoice(formData, user.teamId);
  if (!photo.ok) return fail(photo.error);
  if (!text.data && !photo.photoId) return fail("Skriv en besked eller vælg et billede.");

  const limit = await checkRateLimit("chat", user.id);
  if (!limit.allowed) return fail("Du sender meget hurtigt. Vent lidt.");
  await recordFailedAttempt("chat", user.id);

  await teamDb(user.teamId).chatMessage.create({
    data: { teamId: user.teamId, authorId: user.id, body: text.data ?? "", photoId: photo.photoId ?? null },
  });
  announce(user.teamId, CHAT_POSTED);

  const members = await teamDb(user.teamId).teamMember.findMany({ select: { userId: true } });
  notifyLater(
    members.map((m) => m.userId),
    user.id,
    {
      title: `${user.name} · ${user.teamName}`,
      body: text.data ? text.data.slice(0, 140) : "📷 Sendte et billede",
      url: "/chat",
      // One notification per team chat, replaced rather than stacked.
      tag: `chat-${user.teamId}`,
    },
  );
  revalidatePath("/chat");
  return ok();
}

export async function deleteChatMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const message = await db.chatMessage.findFirst({ where: { id: String(formData.get("id") ?? "") } });
  if (!message) return ok();
  if (message.authorId !== user.id && !canAdministerTeam(user, user.teamId)) return fail("Det er ikke din besked.");
  await db.chatMessage.deleteMany({ where: { id: message.id } });
  await discardPhoto(user.teamId, message.photoId);
  announce(user.teamId, CHAT_POSTED);
  revalidatePath("/chat");
  return ok();
}

/* ── Feed ───────────────────────────────────────────────────────────────────────── */

export async function createPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Teksten er for lang (højst ${MAX_MESSAGE} tegn).`);
  const photo = await readPhotoChoice(formData, user.teamId);
  if (!photo.ok) return fail(photo.error);
  if (!text.data && !photo.photoId) return fail("Vælg et billede eller skriv noget.");
  await teamDb(user.teamId).post.create({
    data: { teamId: user.teamId, authorId: user.id, body: text.data, photoId: photo.photoId ?? null },
  });
  const members = await teamDb(user.teamId).teamMember.findMany({ select: { userId: true } });
  notifyLater(
    members.map((m) => m.userId),
    user.id,
    { title: `${user.name} delte i feedet`, body: text.data?.slice(0, 140) ?? "📷 Nyt billede", url: "/feed", tag: "feed" },
  );
  revalidatePath("/feed");
  revalidatePath("/oversigt");
  return ok();
}

export async function deletePost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const post = await db.post.findFirst({ where: { id: String(formData.get("id") ?? "") } });
  if (!post) return ok();
  if (post.authorId !== user.id && !canAdministerTeam(user, user.teamId)) return fail("Det er ikke dit opslag.");
  await db.post.deleteMany({ where: { id: post.id } });
  await discardPhoto(user.teamId, post.photoId);
  revalidatePath("/feed");
  revalidatePath("/oversigt");
  return ok();
}

/** Likes and comments carry no team of their own; the post is found through `teamDb` first. */
async function postInTeam(teamId: string, postId: string) {
  return teamDb(teamId).post.findFirst({ where: { id: postId }, select: { id: true, authorId: true } });
}

export async function toggleLike(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const post = await postInTeam(user.teamId, String(formData.get("postId") ?? ""));
  if (!post) return fail("Opslaget findes ikke.");
  const key = { postId_userId: { postId: post.id, userId: user.id } };
  const liked = await prisma.postLike.findUnique({ where: key });
  if (liked) await prisma.postLike.delete({ where: key });
  else await prisma.postLike.create({ data: { postId: post.id, userId: user.id } });
  revalidatePath("/feed");
  return ok();
}

export async function addComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const post = await postInTeam(user.teamId, String(formData.get("postId") ?? ""));
  if (!post) return fail("Opslaget findes ikke.");
  const text = z.string().trim().min(1, "Skriv en kommentar.").max(1000).safeParse(formData.get("body") ?? "");
  if (!text.success) return fail(text.error.issues[0]?.message ?? "Skriv en kommentar.");
  await prisma.postComment.create({ data: { postId: post.id, authorId: user.id, body: text.data } });
  notifyLater([post.authorId], user.id, {
    title: `${user.name} kommenterede dit opslag`,
    body: text.data.slice(0, 140),
    url: "/feed",
  });
  revalidatePath("/feed");
  return ok();
}

export async function deleteComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const comment = await prisma.postComment.findFirst({
    where: { id: String(formData.get("id") ?? ""), post: { teamId: user.teamId } },
  });
  if (!comment) return ok();
  if (comment.authorId !== user.id && !canAdministerTeam(user, user.teamId)) return fail("Det er ikke din kommentar.");
  await prisma.postComment.delete({ where: { id: comment.id } });
  revalidatePath("/feed");
  return ok();
}
