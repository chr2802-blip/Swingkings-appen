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
export function nextFeedCursor(posts: FeedCursor[], take: number): string | null {
  const last = posts.at(-1);
  return last && posts.length === take ? encodeFeedCursor(last) : null;
}

/**
 * The feed's posts, with each poll already turned into what the viewer may see.
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
  const posts = await teamDb(teamId).post.findMany({
    where: after
      ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: person,
      photos: { orderBy: { position: "asc" }, select: { photoId: true } },
      likes: { select: { userId: true, user: { select: { name: true } } } },
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
    },
  });

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
    options: poll.options.map((option, index) => {
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
  };
}
