"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerClub, canAdministerTeam, canChangePost } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field, MAX_MESSAGE } from "@/lib/form";
import { readPhotoChoices, discardPhotos, discardPhotosWhereFiled } from "@/lib/photos";
import { MAX_CHAT_PHOTOS } from "@/lib/photo-file";
import { teamRoster } from "@/lib/roster";
import { castVote } from "@/lib/voting";
import { MAX_POST_PHOTOS } from "@/lib/polls";
import { readPollForm } from "@/lib/poll-form";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { announce } from "@/lib/realtime";
import { CHAT_POSTED, FEED_CHANGED } from "@/lib/realtime-topic";
import { notify, recordComment } from "@/lib/notifications";
import { SHARED_WITH, announceTo, findPostSeenBy, notifyAcross, notifyEverybodyOn, pollsSeenBy, postsSeenBy, teamsOf } from "@/lib/club-reach";
import { notifyChatLater, notifyCommentLater } from "@/lib/grouped-push";
import { mentionedIds } from "@/lib/mentions";

const body = z.string().trim().max(MAX_MESSAGE).optional().transform((v) => v || null);

/* ── Chat ───────────────────────────────────────────────────────────────────────── */

export async function sendChatMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Beskeden er for lang (højst ${MAX_MESSAGE} tegn).`);
  const photos = await readPhotoChoices(formData, user.teamId, MAX_CHAT_PHOTOS, [], "besked");
  if (!photos.ok) return fail(photos.error);
  if (!text.data && photos.photoIds.length === 0) return fail("Skriv en besked eller vælg et billede.");
  // An answer to a message: only one of this team's, found through `teamDb`.
  const answering = field(formData, "replyToId");
  if (answering && !(await teamDb(user.teamId).chatMessage.count({ where: { id: answering } }))) {
    return fail("Beskeden, du svarer på, findes ikke længere.");
  }

  const limit = await checkRateLimit("chat", user.id);
  if (!limit.allowed) return fail("Du sender meget hurtigt. Vent lidt.");
  await recordAttempt("chat", user.id);

  await teamDb(user.teamId).chatMessage.create({
    data: {
      teamId: user.teamId,
      authorId: user.id,
      body: text.data ?? "",
      replyToId: answering || null,
      photos: { create: photos.photoIds.map((photoId, position) => ({ photoId, position })) },
    },
  });
  announce(user.teamId, CHAT_POSTED);

  // Grouped: one buzz, then quiet updates ("7 nye beskeder") — `src/lib/grouped-push.ts`.
  notifyChatLater(user.teamId, user.teamName, user.id);
  revalidatePath("/chat");
  return ok();
}

export async function deleteChatMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const message = await db.chatMessage.findFirst({
    where: { id: field(formData, "id") },
    include: { photos: { select: { photoId: true } } },
  });
  if (!message) return ok();
  if (message.authorId !== user.id && !canAdministerTeam(user, user.teamId)) return fail("Det er ikke din besked.");
  await db.chatMessage.deleteMany({ where: { id: message.id } });
  await discardPhotos(user.teamId, message.photos.map((photo) => photo.photoId));
  announce(user.teamId, CHAT_POSTED);
  revalidatePath("/chat");
  return ok();
}

/* ── Feed ───────────────────────────────────────────────────────────────────────── */

/**
 * A post: pictures (up to ten, already shrunk in the browser), some words, a poll — at
 * least one of them. The poll is read by `readPollForm`: typed answers, or players on the
 * team — the ones ticked on the roster (`pollPlayerId`), or all of them.
 */
export async function createPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Teksten er for lang (højst ${MAX_MESSAGE} tegn).`);
  const photos = await readPhotoChoices(formData, user.teamId, MAX_POST_PHOTOS);
  if (!photos.ok) return fail(photos.error);

  const read = readPollForm(formData, formData.get("withPoll") === "on" ? await teamRoster(user.teamId) : []);
  if (!read.ok) return fail(read.error);
  const poll = read.poll;
  if (poll?.matchId && !(await db.match.count({ where: { id: poll.matchId } }))) return fail("Kampen findes ikke.");
  if (!text.data && photos.photoIds.length === 0 && !poll) return fail("Vælg billeder, skriv noget eller lav en afstemning.");

  const post = await db.post.create({
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
                hideResults: poll.hideResults,
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
  await notify(
    user.teamId,
    members.map((m) => m.userId),
    user.id,
    poll
      ? { category: "FEED", postId: post.id, title: `${user.name} har lavet en afstemning 🗳️`, body: poll.question, url: "/oversigt#feed", tag: "feed" }
      : {
          category: "FEED",
          postId: post.id,
          title: `${user.name} delte i feedet`,
          body: text.data?.slice(0, 140) ?? (photos.photoIds.length > 1 ? `📷 ${photos.photoIds.length} nye billeder` : "📷 Nyt billede"),
          url: "/oversigt#feed",
          tag: "feed",
        },
  );
  announce(user.teamId, FEED_CHANGED);
  revalidatePath("/oversigt");
  return ok();
}

/**
 * Deleting a post: whoever wrote it, the team's admins — or, for a club post, the club's
 * admins (`canChangePost`). A club post goes from every team it was shown to.
 */
export async function deletePost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const post = await findPostSeenBy(user.teamId, field(formData, "id"), {
    id: true,
    authorId: true,
    clubId: true,
    teamId: true,
    teams: SHARED_WITH,
    photos: { select: { photoId: true } },
  });
  if (!post) return ok();
  if (!canChangePost(user, user.teamId, post)) return fail("Det er ikke dit opslag.");
  // Found under this team's reach just above: its own post, or a club post shown to it.
  await prisma.post.deleteMany({ where: { id: post.id } });
  // The pictures belonged to this post and nothing else; a club post's are filed where they were uploaded.
  await discardPhotosWhereFiled(post.photos.map((p) => p.photoId));
  announceTo(teamsOf(post), FEED_CHANGED);
  revalidatePath("/oversigt");
  return ok();
}

/**
 * Changing a post afterwards: its words and its pictures (kept, taken off, added, in the
 * order sent). The poll is left as it was made — people have voted on those answers. A
 * post still needs something in it.
 */
export async function editPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const post = await findPostSeenBy(user.teamId, field(formData, "id"), {
    id: true,
    authorId: true,
    clubId: true,
    teamId: true,
    teams: SHARED_WITH,
    photos: { select: { photoId: true } },
    poll: { select: { id: true } },
  });
  if (!post) return fail("Opslaget findes ikke.");
  if (!canChangePost(user, user.teamId, post)) return fail("Det er ikke dit opslag.");
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Teksten er for lang (højst ${MAX_MESSAGE} tegn).`);
  const before = post.photos.map((p) => p.photoId);
  const photos = await readPhotoChoices(formData, user.teamId, MAX_POST_PHOTOS, before);
  if (!photos.ok) return fail(photos.error);
  if (!text.data && photos.photoIds.length === 0 && !post.poll) return fail("Et opslag skal have tekst eller billeder.");

  // `PostPhoto` has no team of its own; the post was found under this team's reach just above.
  await prisma.$transaction([
    prisma.postPhoto.deleteMany({ where: { postId: post.id } }),
    prisma.postPhoto.createMany({ data: photos.photoIds.map((photoId, position) => ({ postId: post.id, photoId, position })) }),
    prisma.post.updateMany({ where: { id: post.id }, data: { body: text.data, editedAt: new Date() } }),
  ]);
  // The pictures taken off belonged to this post and nothing else.
  await discardPhotosWhereFiled(before.filter((id) => !photos.photoIds.includes(id)));
  announceTo(teamsOf(post), FEED_CHANGED);
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
  const post = await findPostSeenBy(user.teamId, field(formData, "id"), {
    id: true,
    pinnedAt: true,
    clubId: true,
    teamId: true,
    teams: SHARED_WITH,
  });
  if (!post) return fail("Opslaget findes ikke.");
  // A club post lies at the top of every team it is shown to: only the club's admins move it.
  if (post.clubId && !canAdministerClub(user, post.clubId)) return fail("Klubopslag fastgøres af klubbens admins.");
  const pin = formData.get("pinned") === "on";
  if (pin !== (post.pinnedAt !== null)) {
    await prisma.post.updateMany({ where: { id: post.id }, data: { pinnedAt: pin ? new Date() : null } });
  }
  announceTo(teamsOf(post), FEED_CHANGED);
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
    field(formData, "pollId"),
    formData.getAll("optionId").map(String),
  );
  if (!result.ok) return fail(result.error);
  announceTo(result.teamIds, FEED_CHANGED);
  revalidatePath("/oversigt");
  return ok();
}

/** A poll the team sees — its own, or one on a club post shown to it — with who may look after it. */
function pollSeenBy<S extends Prisma.PollSelect>(teamId: string, pollId: string, select: S) {
  return prisma.poll.findFirst({ where: { AND: [{ id: pollId }, pollsSeenBy(teamId)] }, select });
}

/** Closing early: whoever made the poll, or the team's admins. */
export async function closePoll(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const poll = await pollSeenBy(user.teamId, field(formData, "pollId"), {
    id: true,
    closedAt: true,
    post: { select: { authorId: true, clubId: true, teamId: true, teams: SHARED_WITH } },
  });
  if (!poll) return fail("Afstemningen findes ikke.");
  if (!canChangePost(user, user.teamId, poll.post)) return fail("Det er ikke din afstemning.");
  if (!poll.closedAt) await prisma.poll.updateMany({ where: { id: poll.id }, data: { closedAt: new Date() } });
  announceTo(teamsOf(poll.post), FEED_CHANGED);
  revalidatePath("/oversigt");
  return ok();
}

/**
 * Showing a hidden result: whoever made the poll, or the team's admins — open or closed.
 * Once shown it stays shown. Guarded on `resultsShownAt`, so a double press tells the team
 * once.
 */
export async function showPollResults(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const poll = await pollSeenBy(user.teamId, field(formData, "pollId"), {
    id: true,
    postId: true,
    question: true,
    hideResults: true,
    post: { select: { authorId: true, clubId: true, teamId: true, teams: SHARED_WITH } },
  });
  if (!poll) return fail("Afstemningen findes ikke.");
  if (!canChangePost(user, user.teamId, poll.post)) return fail("Det er ikke din afstemning.");
  if (!poll.hideResults) return fail("Resultatet er ikke skjult.");
  const shown = await prisma.poll.updateMany({ where: { id: poll.id, resultsShownAt: null }, data: { resultsShownAt: new Date() } });
  const teamIds = teamsOf(poll.post);
  if (shown.count > 0) {
    // Everybody the poll is shown to — one team, or each of a club post's — hears it once.
    await notifyEverybodyOn(teamIds, user.id, {
      category: "FEED",
      postId: poll.postId,
      title: "Resultatet er offentliggjort 🗳️",
      body: poll.question,
      url: "/oversigt#feed",
      tag: "feed",
    });
  }
  announceTo(teamIds, FEED_CHANGED);
  revalidatePath("/oversigt");
  return ok();
}

/**
 * Comments carry no team of their own; the post is found first, under the team's reach:
 * its own post, or a club post shown to it — where every team it is shown to comments together.
 */
async function postInTeam(teamId: string, postId: string) {
  return findPostSeenBy(teamId, postId, { id: true, authorId: true, clubId: true, teamId: true, teams: SHARED_WITH });
}

/**
 * A comment on a post, or an answer to one (`parentId`). Answers sit one level deep: an
 * answer to an answer goes under the comment that started the thread. Whoever is answered
 * hears of it, and so does whoever started the thread, without being named in the words;
 * whoever is tagged ("@Bo") hears of it; the post's author hears of every comment.
 */
export async function addComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const post = await postInTeam(user.teamId, field(formData, "postId"));
  if (!post) return fail("Opslaget findes ikke.");
  const text = z.string().trim().min(1, "Skriv en kommentar.").max(1000).safeParse(formData.get("body") ?? "");
  if (!text.success) return fail(text.error.issues[0]?.message ?? "Skriv en kommentar.");
  const answering = field(formData, "parentId");
  let replyTo: { id: string; authorId: string; parent: { id: string; authorId: string } | null } | null = null;
  if (answering) {
    // Only a comment on this very post, which was found under this team's reach above.
    replyTo = await prisma.postComment.findFirst({
      where: { id: answering, postId: post.id },
      select: { id: true, authorId: true, parent: { select: { id: true, authorId: true } } },
    });
    if (!replyTo) return fail("Kommentaren findes ikke længere.");
  }
  const thread = replyTo?.parent ?? replyTo;

  await prisma.postComment.create({ data: { postId: post.id, authorId: user.id, body: text.data, parentId: thread?.id ?? null } });
  const preview = text.data.slice(0, 140);
  // Each person hears of it once, in the most particular words that fit them: answered,
  // then tagged, then the post's author. Who is tagged is read from the words against
  // this team's roster, so nobody on another team can be tagged.
  const answered = replyTo && thread ? [replyTo.authorId, thread.authorId] : [];
  const tagged = mentionedIds(text.data, await teamRoster(user.teamId)).filter((id) => !answered.includes(id));
  const about = { category: "COMMENTS", url: "/oversigt#feed", postId: post.id } as const;
  // On a club post the one answered may be on another of its teams: each hears it on their own.
  const teamIds = teamsOf(post);
  await notifyAcross(teamIds, answered, user.id, { ...about, title: `${user.name} svarede på din kommentar`, body: preview });
  await notify(user.teamId, tagged, user.id, { ...about, title: `${user.name} nævnte dig i en kommentar`, body: preview });
  if (!answered.includes(post.authorId) && !tagged.includes(post.authorId)) {
    // Grouped per post, in the center and on the phone: one buzz, then a quiet count.
    await recordComment(user.teamId, post.id, user.id);
    notifyCommentLater(post.id, user.id);
  }
  announceTo(teamIds, FEED_CHANGED);
  revalidatePath("/oversigt");
  return ok();
}

export async function deleteComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const comment = await prisma.postComment.findFirst({
    where: { id: field(formData, "id"), post: postsSeenBy(user.teamId) },
    select: { id: true, authorId: true, post: { select: { authorId: true, clubId: true, teamId: true, teams: SHARED_WITH } } },
  });
  if (!comment) return ok();
  // Whoever wrote it, and whoever looks after the post: the team's admins, or a club post's club admins.
  const looksAfter = comment.post.clubId ? canAdministerClub(user, comment.post.clubId) : canAdministerTeam(user, user.teamId);
  if (comment.authorId !== user.id && !looksAfter) return fail("Det er ikke din kommentar.");
  await prisma.postComment.delete({ where: { id: comment.id } });
  announceTo(teamsOf(comment.post), FEED_CHANGED);
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
