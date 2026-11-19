import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { sendPushToUsers } from "./push";
import { PUSH_PAUSE_MS, chatSummary, chatText, commentSummary, isActive, latest, type Unread } from "./push-summary";

/**
 * Grouped notifications for the team chat and the comments on a post. The rules and the
 * wording are in `src/lib/push-summary.ts`; this reads who has seen what and sends. It
 * all runs after the response, like `notify` (`src/lib/notifications.ts`), and only with VAPID keys.
 * Somebody who muted the chat (or comments) on the team in the notification center hears nothing.
 */

/** The most unread messages one notification counts; past it, it says "99+". */
const COUNT_UP_TO = 100;

function later(task: () => Promise<unknown>) {
  if (!process.env.VAPID_PRIVATE_KEY) return;
  after(() => task().catch((error) => console.error(JSON.stringify({ event: "push_failed", error: String(error) }))));
}

/**
 * Whether this person gets a full push for the thread now — none before, the pause is
 * over, or they have read it since the last one — and if so starts a new pause. Guarded
 * in the database, so two messages at once give one full push and one quiet update.
 */
export async function claimFullPush(userId: string, key: string, readAt: Date, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - PUSH_PAUSE_MS);
  const claimed = await prisma.pushPause.updateMany({
    where: { userId, key, OR: [{ pushedAt: { lt: cutoff } }, { pushedAt: { lt: readAt } }] },
    data: { pushedAt: now },
  });
  if (claimed.count > 0) return true;
  try {
    await prisma.pushPause.create({ data: { userId, key, pushedAt: now } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

/** A new chat message: everybody else on the team hears about what they have not read. */
export function notifyChatLater(teamId: string, teamName: string, authorId: string) {
  later(() => pushChat(teamId, teamName, authorId));
}

export async function pushChat(teamId: string, teamName: string, authorId: string, now: Date = new Date()) {
  const db = teamDb(teamId);
  const members = await db.teamMember.findMany({
    where: { userId: { not: authorId }, NOT: { mutedPush: { has: "CHAT" } }, user: { pushSubscriptions: { some: {} } } },
    select: { userId: true, chatSeenAt: true, createdAt: true },
  });
  const listening = members.filter((m) => !isActive(m.chatSeenAt, now));
  if (listening.length === 0) return;

  const since = new Date(Math.min(...listening.map((m) => latest(m.chatSeenAt, m.createdAt).getTime())));
  const messages = (
    await db.chatMessage.findMany({
      where: { createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: COUNT_UP_TO,
      select: { authorId: true, body: true, createdAt: true, author: { select: { name: true } }, _count: { select: { photos: true } } },
    })
  ).reverse();

  for (const member of listening) {
    // Writing in the chat is reading it: what came before one's own message is not news.
    const ownLast = messages.findLast((m) => m.authorId === member.userId)?.createdAt;
    const readAt = latest(member.chatSeenAt, member.createdAt, ownLast);
    const unread: Unread[] = messages
      .filter((m) => m.createdAt > readAt && m.authorId !== member.userId)
      .map((m) => ({ authorName: m.author.name, text: chatText(m.body, m._count.photos) }));
    if (unread.length === 0) continue;
    const full = await claimFullPush(member.userId, `chat:${teamId}`, readAt, now);
    await sendPushToUsers([member.userId], {
      ...chatSummary(teamName, unread),
      url: "/chat",
      // One notification per team chat, replaced rather than stacked.
      tag: `chat-${teamId}`,
      quiet: !full,
    });
  }
}

/** A new comment: the post's author hears about the comments they have not read. */
export function notifyCommentLater(postId: string, commenterId: string) {
  later(() => pushComments(postId, commenterId));
}

export async function pushComments(postId: string, commenterId: string, now: Date = new Date()) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { teamId: true, authorId: true, createdAt: true, teams: { select: { teamId: true } } },
  });
  if (!post || post.authorId === commenterId) return;
  // A club post's author is asked on their own team among those it is shown to: the first they joined.
  const teamIds = post.teamId ? [post.teamId] : post.teams.map((t) => t.teamId);
  const member = await prisma.teamMember.findFirst({
    where: { teamId: { in: teamIds }, userId: post.authorId, NOT: { mutedPush: { has: "COMMENTS" } }, user: { pushSubscriptions: { some: {} } } },
    orderBy: [{ createdAt: "asc" }, { teamId: "asc" }],
    select: { feedSeenAt: true },
  });
  if (!member || isActive(member.feedSeenAt, now)) return;

  // Comments are reached through their post, which is the team's: `teamDb` refuses them.
  const comments = (
    await prisma.postComment.findMany({
      where: { postId, createdAt: { gt: latest(member.feedSeenAt, post.createdAt) } },
      orderBy: { createdAt: "desc" },
      take: COUNT_UP_TO,
      select: { authorId: true, body: true, createdAt: true, author: { select: { name: true } } },
    })
  ).reverse();
  const ownLast = comments.findLast((c) => c.authorId === post.authorId)?.createdAt;
  const readAt = latest(member.feedSeenAt, post.createdAt, ownLast);
  const unread: Unread[] = comments
    .filter((c) => c.createdAt > readAt && c.authorId !== post.authorId)
    .map((c) => ({ authorName: c.author.name, text: c.body }));
  if (unread.length === 0) return;

  const full = await claimFullPush(post.authorId, `comments:${postId}`, readAt, now);
  await sendPushToUsers([post.authorId], {
    ...commentSummary(unread),
    url: "/oversigt#feed",
    tag: `comments-${postId}`,
    quiet: !full,
  });
}

/** Pauses long over say nothing any more; the daily job clears them. */
export async function clearOldPushPauses(now: Date = new Date()) {
  const { count } = await prisma.pushPause.deleteMany({ where: { pushedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
  return count;
}
