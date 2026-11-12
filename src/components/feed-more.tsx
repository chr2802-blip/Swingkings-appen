"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { loadFeedPosts } from "@/app/actions/feed";
import { FEED_PAGE } from "@/lib/feed-page";
import { SkeletonBlock } from "@/components/skeleton";

/** Start fetching while the end of the feed is still this far below the screen. */
const AHEAD = "1200px 0px";

/**
 * The rest of the feed, fetched a page at a time as the reader nears the end.
 *
 * `after` is where the server's first page ended. When the page is rendered anew (a like,
 * a comment, a new post: `renderedAt` changes), the posts fetched so far are fetched again
 * in one go from the new `after`, so they show the change too and nothing is doubled.
 */
export function FeedMore({ after, renderedAt }: { after: string | null; renderedAt: number }) {
  const [posts, setPosts] = useState<ReactNode[]>([]);
  const [next, setNext] = useState(after);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const loaded = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(renderedAt);
  /** Bumped when the page is rendered anew, so a fetch begun before it is dropped. */
  const generation = useRef(0);

  const loadMore = useCallback(async () => {
    if (busy.current || !next) return;
    busy.current = true;
    setLoading(true);
    const started = generation.current;
    try {
      const page = await loadFeedPosts(next, FEED_PAGE);
      if (started !== generation.current) return;
      setPosts((shown) => [...shown, page.posts]);
      loaded.current += FEED_PAGE;
      setNext(page.next);
    } catch {
      // A dropped connection: leave the cursor where it was, the next scroll tries again.
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [next]);

  // The page was rendered anew: fetch what was shown again, from the server's new end.
  useEffect(() => {
    if (renderedAt === firstRender.current) return;
    firstRender.current = renderedAt;
    generation.current += 1;
    if (loaded.current === 0 || !after) {
      setPosts([]);
      loaded.current = 0;
      setNext(after);
      return;
    }
    let current = true;
    busy.current = true;
    loadFeedPosts(after, loaded.current)
      .then((page) => {
        if (!current) return;
        setPosts([page.posts]);
        setNext(page.next);
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
    return () => {
      current = false;
    };
  }, [renderedAt, after]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !next) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: AHEAD });
    observer.observe(element);
    return () => observer.disconnect();
  }, [next, loadMore]);

  return (
    <>
      {posts}
      {loading && <SkeletonBlock className="h-72" />}
      {next && <div ref={sentinel} aria-hidden className="h-px" />}
    </>
  );
}
