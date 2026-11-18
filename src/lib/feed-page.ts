/** How many posts the feed shows at first, and how many more each time the end is near. */
export const FEED_PAGE = 10;

/** A search shows at most this many posts, the newest first; there are no pages after it. */
export const FEED_SEARCH_LIMIT = 30;

/** What a search is cut to, and the least it needs before it is asked at all. */
export const FEED_SEARCH_MAX = 100;
export const FEED_SEARCH_MIN = 2;

/** The words searched for, or null when there is too little to search for. */
export function readFeedSearch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const query = value.trim().replace(/\s+/g, " ").slice(0, FEED_SEARCH_MAX);
  return query.length >= FEED_SEARCH_MIN ? query : null;
}
