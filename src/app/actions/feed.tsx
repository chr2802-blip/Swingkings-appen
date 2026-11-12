"use server";

import type { ReactNode } from "react";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { FEED_PAGE, decodeFeedCursor, feedPosts, nextFeedCursor } from "@/lib/feed";
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
  const posts = await feedPosts(user.teamId, { id: user.id, canAdminister: admin }, { take: count, after: cursor });
  return {
    posts: posts.map((post) => <FeedPostCard key={post.id} post={post} viewerId={user.id} admin={admin} />),
    next: nextFeedCursor(posts, count),
  };
}
