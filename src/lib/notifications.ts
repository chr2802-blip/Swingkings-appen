import { after } from "next/server";
import type { NotificationCategory } from "@prisma/client";
import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { sendPushToUsers } from "./push";
import { announce } from "./realtime";
import { NOTIFIED } from "./realtime-topic";
import { pushes } from "./notification-categories";
import { commentSummary, type Unread } from "./push-summary";

/**
 * The notification center and the push that goes with it. Everything the team is told
 * comes through here (but the chat, which has its own count — `grouped-push.ts`): a row
 * per person in `Notification`, written before the response so the bell is right on the
 * next render, and a push after it, unless the person muted that category on this team.
 *
 * Never to the person who caused it, and never to somebody not on the team.
 */

export type Notice = {
  category: NotificationCategory;
  title: string;
  body: string;
  url: string;
  /** A push with the same tag replaces the one before it on the phone. */
  tag?: string;
  /** Pushed even when the category is muted: it waits on the person (pay, take over a task). */
  always?: boolean;
  /** What it is about; deleting that deletes the notification. */
  taskId?: string | null;
  postId?: string | null;
  matchId?: string | null;
  challengeId?: string | null;
  fineId?: string | null;
};

export type Recorded = { id: string; userId: string; notice: Notice; push: boolean };

/** How long the center keeps a notification; the daily job deletes older ones. */
export const KEEP_DAYS = 60;

/** How many the center lists, newest first. */
export const LIST_SIZE = 50;

/**
 * Writes one notification per person (each their own words — an amount, their own page),
 * leaving out the actor, duplicates and anybody not on the team. Says whom to push.
 */
export async function recordNotifications(
  teamId: string,
  actorId: string | null,
  items: (Notice & { userId: string })[],
): Promise<Recorded[]> {
  const seen = new Set<string>();
  const wanted = items.filter((item) => item.userId !== actorId && !seen.has(item.userId) && seen.add(item.userId));
  if (wanted.length === 0) return [];
  const db = teamDb(teamId);
  const members = await db.teamMember.findMany({
    where: { userId: { in: wanted.map((item) => item.userId) } },
    select: { userId: true, mutedPush: true },
  });
  const muted = new Map(members.map((m) => [m.userId, m.mutedPush]));
  const rows = wanted.filter((item) => muted.has(item.userId));
  if (rows.length === 0) return [];

  const created = await db.notification.createManyAndReturn({
    data: rows.map(({ userId, category, title, body, url, taskId, postId, matchId, challengeId, fineId }) => ({
      teamId,
      userId,
      category,
      title,
      body,
      url,
      taskId,
      postId,
      matchId,
      challengeId,
      fineId,
    })),
    select: { id: true, userId: true },
  });
  const byUser = new Map(rows.map((row) => [row.userId, row]));
  announce(teamId, NOTIFIED);
  return created.map(({ id, userId }) => {
    const { userId: _userId, ...notice } = byUser.get(userId)!;
    void _userId;
    return { id, userId, notice, push: pushes(notice.category, muted.get(userId) ?? [], notice.always) };
  });
}

/** Sends the pushes for what was recorded; returns how many phones took one. */
export async function pushNotifications(recorded: Recorded[]) {
  let delivered = 0;
  await Promise.all(
    recorded
      .filter((row) => row.push)
      .map(async ({ id, userId, notice }) => {
        delivered += await sendPushToUsers([userId], {
          title: notice.title,
          body: notice.body,
          url: notice.url,
          ...(notice.tag ? { tag: notice.tag } : {}),
          notificationId: id,
        });
      }),
  );
  return delivered;
}

/** Records each person's own notice and pushes it after the response. */
export async function notifyEach(teamId: string, actorId: string | null, items: (Notice & { userId: string })[]) {
  const recorded = await recordNotifications(teamId, actorId, items);
  if (recorded.some((row) => row.push) && process.env.VAPID_PRIVATE_KEY) {
    after(() =>
      pushNotifications(recorded).catch((error) =>
        console.error(JSON.stringify({ event: "push_failed", error: String(error) })),
      ),
    );
  }
  return recorded;
}

/** The same notice to several people. */
export function notify(teamId: string, userIds: string[], actorId: string | null, notice: Notice) {
  return notifyEach(
    teamId,
    actorId,
    userIds.map((userId) => ({ ...notice, userId })),
  );
}

/**
 * A comment on somebody's post, in their center: one row per post while it is unread,
 * which says how many and from whom, and moves to the top with each. The push is grouped
 * the same way, by `notifyCommentLater`.
 */
export async function recordComment(teamId: string, postId: string, commenterId: string) {
  const db = teamDb(teamId);
  const post = await db.post.findFirst({ where: { id: postId }, select: { id: true, authorId: true } });
  if (!post || post.authorId === commenterId) return;
  if (!(await db.teamMember.count({ where: { userId: post.authorId } }))) return;
  const groupKey = `comments:${post.id}`;
  const open = await db.notification.findFirst({
    where: { userId: post.authorId, groupKey, readAt: null },
    select: { id: true, createdAt: true },
  });
  // Comments are reached through their post, which was found through `teamDb` above.
  const comments = await prisma.postComment.findMany({
    where: { postId: post.id, authorId: { not: post.authorId }, ...(open ? { createdAt: { gte: open.createdAt } } : {}) },
    orderBy: { createdAt: open ? "asc" : "desc" },
    take: open ? 100 : 1,
    select: { body: true, createdAt: true, author: { select: { name: true } } },
  });
  if (comments.length === 0) return;
  const unread: Unread[] = comments.map((c) => ({ authorName: c.author.name, text: c.body }));
  const words = commentSummary(unread);
  if (open) {
    await db.notification.update({ where: { id: open.id }, data: { ...words } });
  } else {
    await db.notification.create({
      // Starts at the comment it is about, so the next one counts it too.
      data: {
        teamId,
        userId: post.authorId,
        category: "COMMENTS",
        ...words,
        url: "/oversigt#feed",
        postId: post.id,
        groupKey,
        createdAt: comments[0]!.createdAt,
      },
    });
  }
  announce(teamId, NOTIFIED);
}

/** What the bell counts: unread notifications that came (or moved) after the center was last opened. */
export async function unseenCount(teamId: string, userId: string) {
  const db = teamDb(teamId);
  const member = await db.teamMember.findFirst({ where: { userId }, select: { notificationsSeenAt: true } });
  if (!member) return 0;
  return db.notification.count({
    where: { userId, readAt: null, ...(member.notificationsSeenAt ? { updatedAt: { gt: member.notificationsSeenAt } } : {}) },
  });
}

export type NotificationItem = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string;
  read: boolean;
  at: string;
};

/** The center: the newest notifications, the bell's count, and the categories muted. */
export async function notificationCenter(teamId: string, userId: string) {
  const db = teamDb(teamId);
  const [rows, member, unseen] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: LIST_SIZE,
      select: { id: true, category: true, title: true, body: true, url: true, readAt: true, updatedAt: true },
    }),
    db.teamMember.findFirst({ where: { userId }, select: { mutedPush: true } }),
    unseenCount(teamId, userId),
  ]);
  const items: NotificationItem[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    url: row.url,
    read: row.readAt !== null,
    at: row.updatedAt.toISOString(),
  }));
  return { items, unseen, muted: member?.mutedPush ?? [] };
}

/** Marks one of this person's own notifications read; false when there is no such one on the team. */
export async function markRead(teamId: string, userId: string, id: string, now: Date = new Date()) {
  const db = teamDb(teamId);
  const found = await db.notification.findFirst({ where: { id, userId }, select: { readAt: true } });
  if (!found) return false;
  if (!found.readAt) await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: now } });
  return true;
}

/**
 * The daily job's sweep: notifications older than `KEEP_DAYS`. It reads across every
 * team on purpose, so it uses `prisma` rather than `teamDb`.
 */
export async function clearOldNotifications(now: Date = new Date()) {
  const { count } = await prisma.notification.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000) } },
  });
  return count;
}
