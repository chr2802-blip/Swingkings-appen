import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { teamDb } from "./team-db";
import { teamRoster } from "./roster";
import { FEED_PAGE } from "./feed-page";
import { isOpen, resultsHidden, tally } from "./polls";
import { kickoffLabel, readInZone } from "./time";
import type { PollViewData } from "@/components/poll-view";
import { reactionRows } from "./reactions";

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
 * ballot. A poll with names on says who has voted; nothing about its results — the counts,
 * or what anybody chose — reaches the browser before the viewer has voted or the poll has
 * closed, so it cannot be read out of the page either.
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
    // Shown as faces, first to react first — hence the picture and the order.
    reactions: reactionRows,
    comments: {
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, parentId: true, body: true, createdAt: true, author: person, reactions: reactionRows },
    },
    poll: {
      select: {
        id: true,
        question: true,
        anonymous: true,
        multipleChoice: true,
        closesAt: true,
        closedAt: true,
        hideResults: true,
        resultsShownAt: true,
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
  // Both at once: neither waits on the other, and each is a round trip to the database.
  const [pinned, paged] = await Promise.all([
    after
      ? []
      : db.post.findMany({
          where: { pinnedAt: { not: null } },
          orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
          take: MAX_PINNED_SHOWN,
          select,
        }),
    db.post.findMany({
      where: {
        pinnedAt: null,
        ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select,
    }),
  ]);
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
  hideResults: boolean;
  resultsShownAt: Date | null;
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
  // A hidden result reaches nobody — the maker and the admins included — until it is shown.
  const hidden = resultsHidden(poll);
  const reveal = !hidden && (hasVoted || !open);
  const canClose = authorId === viewer.id || viewer.canAdminister;
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
    voters: poll.anonymous ? [] : whoVoted(poll.votes),
    myChoices: poll.anonymous ? [] : poll.votes.filter((v) => v.voterId === viewer.id).map((v) => v.optionId),
    canClose,
    resultsHidden: hidden,
    canShowResults: hidden && canClose,
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

/**
 * Everybody who has voted in a poll with names on, each once, by name — without what they
 * chose, so it may be shown to somebody who has not voted yet. An anonymous poll's votes
 * have no voter, and its ballots are never listed: a name appearing as a count goes up
 * would tell what was voted.
 */
function whoVoted(votes: PollRow["votes"]) {
  const voters = new Map<string, NonNullable<PollRow["votes"][number]["voter"]>>();
  for (const vote of votes) if (vote.voter) voters.set(vote.voter.id, vote.voter);
  return [...voters.values()].sort((a, b) => a.name.localeCompare(b.name, "da") || a.id.localeCompare(b.id));
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

/**
 * What the front page's feed section shows: the first page of posts and the roster. Cached
 * for the request, so the front page can start it (`void teamFeed(…)`) alongside its own
 * reads, and `TeamFeed` — rendered only once those are done — finds it already on its way
 * instead of beginning a second round of trips to the database.
 */
export const teamFeed = cache((teamId: string, viewerId: string, canAdminister: boolean) =>
  Promise.all([feedPosts(teamId, { id: viewerId, canAdminister }), teamRoster(teamId)]),
);
