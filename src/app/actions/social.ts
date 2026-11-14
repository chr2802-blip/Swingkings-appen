"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { MAX_MESSAGE, optionalId, readForm } from "@/lib/form";
import { readPhotoChoice, readPhotoChoices, discardPhoto, discardPhotos } from "@/lib/photos";
import { teamRoster } from "@/lib/roster";
import { castVote } from "@/lib/voting";
import { cleanOptions, MAX_POLL_OPTIONS, MAX_POST_PHOTOS } from "@/lib/polls";
import { parseLocalDateTime } from "@/lib/time";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
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
  await recordAttempt("chat", user.id);

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

const pollSchema = z.object({
  pollQuestion: z.string().trim().min(1, "Skriv spørgsmålet til afstemningen.").max(200),
  pollKind: z.enum(["custom", "players"]).default("custom"),
  /** "on" when the players were picked from the roster; otherwise every player is an answer. */
  pollPickPlayers: z.enum(["on", "off"]).default("off"),
  pollAnonymous: z.enum(["on", "off"]).default("off"),
  pollMultiple: z.enum(["on", "off"]).default("off"),
  pollClosesAt: z.string().trim().optional(),
  pollMatchId: optionalId,
});

/**
 * A post: pictures (up to ten, already shrunk in the browser), some words, a poll — at
 * least one of them. A poll's answers are either typed, or players on the team — the
 * ones ticked on the roster (`pollPlayerId`), or all of them. Whether it is anonymous is fixed here and never changed later.
 */
export async function createPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Teksten er for lang (højst ${MAX_MESSAGE} tegn).`);
  const photos = await readPhotoChoices(formData, user.teamId, MAX_POST_PHOTOS);
  if (!photos.ok) return fail(photos.error);

  let poll: {
    question: string;
    anonymous: boolean;
    multipleChoice: boolean;
    closesAt: Date | null;
    matchId: string | null;
    options: { text: string; playerId: string | null }[];
  } | null = null;
  if (formData.get("withPoll") === "on") {
    const form = readForm(pollSchema, formData);
    if (!form.ok) return fail(form.error);
    let options: { text: string; playerId: string | null }[];
    if (form.fields.pollKind === "players") {
      const roster = await teamRoster(user.teamId);
      let chosen = roster;
      if (form.fields.pollPickPlayers === "on") {
        const picked = new Set(formData.getAll("pollPlayerId").map(String).filter(Boolean));
        if ([...picked].some((id) => !roster.some((m) => m.userId === id))) return fail("Spilleren er ikke på holdet.");
        chosen = roster.filter((m) => picked.has(m.userId));
      }
      options = chosen.map((m) => ({ text: m.name, playerId: m.userId }));
    } else {
      options = cleanOptions(formData.getAll("pollOption").map(String)).map((t) => ({ text: t, playerId: null }));
    }
    if (options.length < 2) return fail("En afstemning skal have mindst to svarmuligheder.");
    if (options.length > MAX_POLL_OPTIONS) return fail(`Højst ${MAX_POLL_OPTIONS} svarmuligheder.`);
    let closesAt: Date | null = null;
    if (form.fields.pollClosesAt) {
      closesAt = parseLocalDateTime(form.fields.pollClosesAt);
      if (!closesAt) return fail("Sluttidspunktet kunne ikke læses.");
      if (closesAt <= new Date()) return fail("Sluttidspunktet skal ligge ude i fremtiden.");
    }
    if (form.fields.pollMatchId && !(await db.match.count({ where: { id: form.fields.pollMatchId } }))) {
      return fail("Kampen findes ikke.");
    }
    poll = {
      question: form.fields.pollQuestion,
      anonymous: form.fields.pollAnonymous === "on",
      multipleChoice: form.fields.pollMultiple === "on",
      closesAt,
      matchId: form.fields.pollMatchId,
      options,
    };
  }
  if (!text.data && photos.photoIds.length === 0 && !poll) return fail("Vælg billeder, skriv noget eller lav en afstemning.");

  await db.post.create({
    data: {
      teamId: user.teamId,
      authorId: user.id,
      body: text.data,
      photos: { create: photos.photoIds.map((photoId, position) => ({ photoId, position })) },
      ...(poll
        ? {
            poll: {
              create: {
                teamId: user.teamId,
                question: poll.question,
                anonymous: poll.anonymous,
                multipleChoice: poll.multipleChoice,
                closesAt: poll.closesAt,
                matchId: poll.matchId,
                options: { create: poll.options.map((o, position) => ({ ...o, position })) },
              },
            },
          }
        : {}),
    },
  });
  const members = await db.teamMember.findMany({ select: { userId: true } });
  notifyLater(
    members.map((m) => m.userId),
    user.id,
    poll
      ? { title: `${user.name} har lavet en afstemning 🗳️`, body: poll.question, url: "/oversigt#feed", tag: "feed" }
      : {
          title: `${user.name} delte i feedet`,
          body: text.data?.slice(0, 140) ?? (photos.photoIds.length > 1 ? `📷 ${photos.photoIds.length} nye billeder` : "📷 Nyt billede"),
          url: "/oversigt#feed",
          tag: "feed",
        },
  );
  revalidatePath("/oversigt");
  return ok();
}

export async function deletePost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const post = await db.post.findFirst({
    where: { id: String(formData.get("id") ?? "") },
    select: { id: true, authorId: true, photos: { select: { photoId: true } } },
  });
  if (!post) return ok();
  if (!canChangePost(user, post)) return fail("Det er ikke dit opslag.");
  await db.post.deleteMany({ where: { id: post.id } });
  // The pictures belonged to this post and nothing else.
  await discardPhotos(user.teamId, post.photos.map((p) => p.photoId));
  revalidatePath("/oversigt");
  return ok();
}

/** Who may change or delete a post: whoever wrote it, and the team's admins. */
function canChangePost(user: Awaited<ReturnType<typeof requireTeamUser>>, post: { authorId: string }) {
  return post.authorId === user.id || canAdministerTeam(user, user.teamId);
}

/**
 * Changing a post afterwards: its words and its pictures (kept, taken off, added, in the
 * order sent). The poll is left as it was made — people have voted on those answers. A
 * post still needs something in it.
 */
export async function editPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const post = await db.post.findFirst({
    where: { id: String(formData.get("id") ?? "") },
    select: { id: true, authorId: true, photos: { select: { photoId: true } }, poll: { select: { id: true } } },
  });
  if (!post) return fail("Opslaget findes ikke.");
  if (!canChangePost(user, post)) return fail("Det er ikke dit opslag.");
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Teksten er for lang (højst ${MAX_MESSAGE} tegn).`);
  const before = post.photos.map((p) => p.photoId);
  const photos = await readPhotoChoices(formData, user.teamId, MAX_POST_PHOTOS, before);
  if (!photos.ok) return fail(photos.error);
  if (!text.data && photos.photoIds.length === 0 && !post.poll) return fail("Et opslag skal have tekst eller billeder.");

  // `PostPhoto` has no team of its own; the post was found through `teamDb` just above.
  await prisma.$transaction([
    prisma.postPhoto.deleteMany({ where: { postId: post.id } }),
    prisma.postPhoto.createMany({ data: photos.photoIds.map((photoId, position) => ({ postId: post.id, photoId, position })) }),
    prisma.post.updateMany({ where: { id: post.id, teamId: user.teamId }, data: { body: text.data, editedAt: new Date() } }),
  ]);
  // The pictures taken off belonged to this post and nothing else.
  await discardPhotos(user.teamId, before.filter((id) => !photos.photoIds.includes(id)));
  revalidatePath("/oversigt");
  return ok();
}

/**
 * Pinning puts a post at the top of the feed; pressing again lets it go. For everybody on
 * the team, whoever wrote the post. The form says which way (`pinned`), so two people
 * pressing at once end where they both meant.
 */
export async function pinPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const post = await db.post.findFirst({ where: { id: String(formData.get("id") ?? "") }, select: { id: true, pinnedAt: true } });
  if (!post) return fail("Opslaget findes ikke.");
  const pin = formData.get("pinned") === "on";
  if (pin !== (post.pinnedAt !== null)) {
    await db.post.updateMany({ where: { id: post.id }, data: { pinnedAt: pin ? new Date() : null } });
  }
  revalidatePath("/oversigt");
  return ok();
}

/* ── Polls ──────────────────────────────────────────────────────────────────────── */

/** Casting (or, in an open poll, changing) a vote — see `castVote`. */
export async function vote(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const result = await castVote(
    user.teamId,
    user.id,
    String(formData.get("pollId") ?? ""),
    formData.getAll("optionId").map(String),
  );
  if (!result.ok) return fail(result.error);
  revalidatePath("/oversigt");
  return ok();
}

/** Closing early: whoever made the poll, or the team's admins. */
export async function closePoll(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const poll = await db.poll.findFirst({
    where: { id: String(formData.get("pollId") ?? "") },
    select: { id: true, closedAt: true, post: { select: { authorId: true } } },
  });
  if (!poll) return fail("Afstemningen findes ikke.");
  if (poll.post.authorId !== user.id && !canAdministerTeam(user, user.teamId)) return fail("Det er ikke din afstemning.");
  if (!poll.closedAt) await db.poll.updateMany({ where: { id: poll.id }, data: { closedAt: new Date() } });
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
  revalidatePath("/oversigt");
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
    url: "/oversigt#feed",
  });
  revalidatePath("/oversigt");
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
  revalidatePath("/oversigt");
  return ok();
}

/* ── Feed seen ──────────────────────────────────────────────────────────────────── */

/**
 * The feed has been in view: posts until now are no longer "nye opslag" on the front
 * page. Reads no input. Nothing is revalidated — the banner catches up on the next visit
 * rather than jumping while the person reads.
 */
export async function markFeedSeen(): Promise<void> {
  const user = await requireTeamUser();
  await teamDb(user.teamId).teamMember.updateMany({ where: { userId: user.id }, data: { feedSeenAt: new Date() } });
}
