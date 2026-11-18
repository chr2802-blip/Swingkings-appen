"use server";

import type { ReactNode } from "react";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { FEED_PAGE, FEED_SEARCH_LIMIT, decodeFeedCursor, feedPosts, nextFeedCursor, readFeedSearch } from "@/lib/feed";
import { teamRoster } from "@/lib/roster";
import { FeedPostCard } from "@/components/feed-post";

/** At most this many posts in one fetch, however many the browser asks for. */
const MAX_TAKE = 100;

export type FeedPage = { posts: ReactNode; next: string | null };

/**
 * The feed's posts after `after`, rendered as on the front page. A read, not a form: it
 * changes nothing, so it takes the cursor and a count rather than `(prev, formData)`.
 * Posts are read through `teamDb` for the viewer's own team, so a cursor names only a
 * place in that team's feed.
 */
export async function loadFeedPosts(after: unknown, take: unknown = FEED_PAGE): Promise<FeedPage> {
  const user = await requireTeamUser();
  const cursor = typeof after === "string" ? decodeFeedCursor(after) : null;
  if (!cursor) return { posts: null, next: null };
  const count = typeof take === "number" && Number.isInteger(take) ? Math.min(Math.max(take, 1), MAX_TAKE) : FEED_PAGE;

  const admin = canAdministerTeam(user, user.teamId);
  const [posts, roster] = await Promise.all([
    feedPosts(user.teamId, { id: user.id, canAdminister: admin }, { take: count, after: cursor }),
    teamRoster(user.teamId),
  ]);
  const members = roster.map((m) => ({ userId: m.userId, name: m.name, photoId: m.photoId }));
  return {
    posts: posts.map((post) => <FeedPostCard key={post.id} post={post} viewerId={user.id} admin={admin} members={members} />),
    next: nextFeedCursor(posts, count),
  };
}

export type FeedSearchResult = { posts: ReactNode; count: number; limited: boolean };

/**
 * The posts in the viewer's own team matching `query` — by their words, their author, their
 * poll or a comment on them — rendered as on the front page, newest first and at most
 * `FEED_SEARCH_LIMIT`. A read, like `loadFeedPosts`; too short a query finds nothing.
 */
export async function searchFeed(query: unknown): Promise<FeedSearchResult> {
  const user = await requireTeamUser();
  const search = readFeedSearch(query);
  if (!search) return { posts: null, count: 0, limited: false };

  const admin = canAdministerTeam(user, user.teamId);
  const [posts, roster] = await Promise.all([
    feedPosts(user.teamId, { id: user.id, canAdminister: admin }, { take: FEED_SEARCH_LIMIT, search }),
    teamRoster(user.teamId),
  ]);
  const members = roster.map((m) => ({ userId: m.userId, name: m.name, photoId: m.photoId }));
  return {
    posts: posts.map((post) => <FeedPostCard key={post.id} post={post} viewerId={user.id} admin={admin} members={members} />),
    count: posts.length,
    limited: posts.length === FEED_SEARCH_LIMIT,
  };
}
