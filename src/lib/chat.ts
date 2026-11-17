import { teamDb } from "./team-db";
import { latest } from "./push-summary";
import { UNREAD_UP_TO } from "./chat-count";

/** How many messages the chat shows at once. */
export const CHAT_PAGE = 60;

export type ChatItem = {
  id: string;
  body: string;
  /** Its pictures, in the order they were chosen. */
  photoIds: string[];
  /** A task shared to ask whether somebody will take it over, drawn as a link to it. */
  task: { id: string; title: string } | null;
  createdAt: string;
  author: { id: string; name: string; photoId: string | null };
};

/** The latest messages, oldest first, as the chat page and `/api/chat` both draw them. */
export async function latestMessages(teamId: string): Promise<ChatItem[]> {
  const rows = await teamDb(teamId).chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, photoId: true } },
      task: { select: { id: true, title: true } },
      photos: { orderBy: { position: "asc" }, select: { photoId: true } },
    },
  });
  return rows.reverse().map(({ photos, ...row }) => ({
    ...row,
    photoIds: photos.map((photo) => photo.photoId),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** How often an open chat writes that it is open: once in this long is enough to hold a push back. */
const SEEN_EVERY_MS = 15_000;

/**
 * The chat is open in front of this person: their chat pushes wait (`src/lib/grouped-push.ts`).
 * Called on the page and on every poll of `/api/chat`, which the chat only makes while it
 * is in view — so a phone in a pocket stops counting as reading within a minute.
 */
export async function markChatSeen(teamId: string, userId: string, now: Date = new Date()) {
  const db = teamDb(teamId);
  // A message that came in since the last mark is written down at once, however recent the
  // mark: otherwise it would still count as unread (`unreadChatCount`) after it was read.
  const newest = await db.chatMessage.findFirst({ where: { createdAt: { lte: now } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const stale = [{ chatSeenAt: null }, { chatSeenAt: { lt: new Date(now.getTime() - SEEN_EVERY_MS) } }];
  await db.teamMember.updateMany({
    where: { userId, OR: newest ? [...stale, { chatSeenAt: { lt: newest.createdAt } }] : stale },
    data: { chatSeenAt: now },
  });
}

/**
 * How many of the team's messages this person has not read, for the chat button. Read is
 * what the push grouping takes it to be (`src/lib/grouped-push.ts`): everything up to the
 * last time the chat was open, to when they joined, and to their own last message.
 */
export async function unreadChatCount(teamId: string, userId: string): Promise<number> {
  const db = teamDb(teamId);
  const [member, ownLast] = await Promise.all([
    db.teamMember.findFirst({ where: { userId }, select: { chatSeenAt: true, createdAt: true } }),
    db.chatMessage.findFirst({ where: { authorId: userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (!member) return 0;
  const readAt = latest(member.chatSeenAt, member.createdAt, ownLast?.createdAt);
  return db.chatMessage.count({ where: { createdAt: { gt: readAt }, authorId: { not: userId } }, take: UNREAD_UP_TO });
}
