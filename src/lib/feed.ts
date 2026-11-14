import type { Prisma } from "@prisma/client";
import { teamDb } from "./team-db";
import { FEED_PAGE } from "./feed-page";
import { isOpen, tally } from "./polls";
import { kickoffLabel, readInZone } from "./time";
import type { PollViewData } from "@/components/poll-view";

export { FEED_PAGE };

const person = { select: { id: true, name: true, photoId: true } } as const;

/**
 * Where a page of the feed ends: the last post shown, by its place in the order. Read by
 * value, not as a row, so a post deleted in the meantime does not lose the place.
 */
export type FeedCursor = { createdAt: Date; id: string };

export function encodeFeedCursor(post: FeedCursor): string {
  return `${post.createdAt.toISOString()}_${post.id}`;
}

export function decodeFeedCursor(value: string): FeedCursor | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([A-Za-z0-9_-]{1,64})$/.exec(value);
  if (!match) return null;
  const createdAt = new Date(match[1]!);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: match[2]! };
}

/** The cursor after a page, or null when the page was the last one. */
export function nextFeedCursor(posts: (FeedCursor & { pinnedAt?: Date | null })[], take: number): string | null {
  // Pinned posts come before the pages and are not counted in them.
  const paged = posts.filter((post) => !post.pinnedAt);
  const last = paged.at(-1);
  return last && paged.length === take ? encodeFeedCursor(last) : null;
}

/** At most this many pinned posts are shown at the top; more than that is no longer a top. */
export const MAX_PINNED_SHOWN = 20;

/**
 * The feed's posts, with each poll already turned into what the viewer may see. The first
 * page is the pinned posts and then `take` of the others; a page after a cursor is `take`
 * of the others.
 *
 * This is where an anonymous poll stays anonymous on the way to the phone: its votes
 * have no voter to send, and the only per-person fact read is whether the *viewer* has a
 * ballot. An open poll's voters are named; nothing about a poll's results reaches the
 * browser before the viewer has voted or the poll has closed, so it cannot be read out
 * of the page either.
 */
export async function feedPosts(
  teamId: string,
  viewer: { id: string; canAdminister: boolean },
  { take = FEED_PAGE, after = null, now = new Date() }: { take?: number; after?: FeedCursor | null; now?: Date } = {},
) {
  const select = {
    id: true,
    body: true,
    createdAt: true,
    editedAt: true,
    pinnedAt: true,
    author: person,
    photos: { orderBy: { position: "asc" }, select: { photoId: true } },
    // Shown as faces, first to like first — hence the picture and the order.
    likes: { orderBy: [{ createdAt: "asc" }, { userId: "asc" }], select: { userId: true, user: { select: { name: true, photoId: true } } } },
    comments: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, author: person } },
    poll: {
      select: {
        id: true,
        question: true,
        anonymous: true,
        multipleChoice: true,
        closesAt: true,
        closedAt: true,
        match: { select: { opponent: true, title: true, startsAt: true } },
        options: {
          orderBy: { position: "asc" },
          select: { id: true, text: true, playerId: true, player: { select: { photoId: true } } },
        },
        votes: { select: { optionId: true, voterId: true, voter: person } },
        ballots: { select: { userId: true } },
      },
    },
  } satisfies Prisma.PostSelect;
  const db = teamDb(teamId);
  // The pinned posts lead the first page, the latest pinned first; the pages after it are
  // the rest, newest first, so the cursor never meets a pinned post.
  const pinned = after
    ? []
    : await db.post.findMany({
        where: { pinnedAt: { not: null } },
        orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
        take: MAX_PINNED_SHOWN,
        select,
      });
  const paged = await db.post.findMany({
    where: {
      pinnedAt: null,
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select,
  });
  const posts = [...pinned, ...paged];

  return posts.map(({ poll, ...post }) => ({
    ...post,
    photoIds: post.photos.map((p) => p.photoId),
    poll: poll ? pollView(poll, post.author.id, viewer, now) : null,
  }));
}

type PollRow = {
  id: string;
  question: string;
  anonymous: boolean;
  multipleChoice: boolean;
  closesAt: Date | null;
  closedAt: Date | null;
  match: { opponent: string | null; title: string; startsAt: Date } | null;
  options: { id: string; text: string; playerId: string | null; player: { photoId: string | null } | null }[];
  votes: { optionId: string; voterId: string | null; voter: { id: string; name: string; photoId: string | null } | null }[];
  ballots: { userId: string }[];
};

export function pollView(
  poll: PollRow,
  authorId: string,
  viewer: { id: string; canAdminister: boolean },
  now: Date = new Date(),
): PollViewData {
  const open = isOpen(poll, now);
  const hasVoted = poll.ballots.some((b) => b.userId === viewer.id);
  const reveal = hasVoted || !open;
  const counts = tally(
    poll.options.map((o) => o.id),
    poll.votes,
    poll.ballots.length,
  );
  return {
    id: poll.id,
    question: poll.question,
    anonymous: poll.anonymous,
    multipleChoice: poll.multipleChoice,
    open,
    closesLabel: poll.closesAt ? `Slutter ${readInZone(poll.closesAt, "d. MMM 'kl.' HH:mm")}` : null,
    matchLabel: poll.match ? `${poll.match.opponent ?? poll.match.title} · ${kickoffLabel(poll.match.startsAt)}` : null,
    ballots: poll.ballots.length,
    hasVoted,
    myChoices: poll.anonymous ? [] : poll.votes.filter((v) => v.voterId === viewer.id).map((v) => v.optionId),
    canClose: authorId === viewer.id || viewer.canAdminister,
    options: sortByVotes(
      poll.options.map((option, index) => {
        const count = counts[index]!;
        return {
          id: option.id,
          text: option.text,
          isPlayer: option.playerId !== null,
          playerPhotoId: option.player?.photoId ?? null,
          votes: reveal ? count.votes : 0,
          share: reveal ? count.share : 0,
          leading: reveal && count.leading,
          voters:
            reveal && !poll.anonymous
              ? poll.votes.filter((v) => v.optionId === option.id && v.voter).map((v) => v.voter!)
              : [],
        };
      }),
    ),
  };
}

/** A post shows this many of the faces that liked it; the rest are a number. */
export const LIKERS_SHOWN = 5;

/**
 * Who liked a post, as the feed shows it: the first few as faces, the rest counted, and
 * one sentence naming them for somebody who cannot see the faces.
 */
export function likersView<T extends { user: { name: string } }>(likes: T[], shown = LIKERS_SHOWN) {
  const faces = likes.slice(0, shown);
  const more = likes.length - faces.length;
  const names = faces.map((like) => like.user.name);
  const list =
    more > 0
      ? `${names.join(", ")} og ${more} mere`
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")} og ${names.at(-1)}`
        : (names[0] ?? "");
  return { faces, more, label: list ? `${list} synes godt om opslaget` : "" };
}

/**
 * Most votes first once the result is shown; ties keep the order the answers were
 * written in. Before that every count is 0, so the written order stands.
 */
export function sortByVotes<T extends { votes: number }>(options: T[]): T[] {
  return options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => b.option.votes - a.option.votes || a.index - b.index)
    .map(({ option }) => option);
}
