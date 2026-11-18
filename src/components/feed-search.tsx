"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { searchFeed, type FeedSearchResult } from "@/app/actions/feed";
import { FEED_SEARCH_MAX, FEED_SEARCH_MIN, FEED_SEARCH_LIMIT } from "@/lib/feed-page";
import { SkeletonBlock } from "@/components/skeleton";

/** How long typing has to pause before the search is asked. */
const SETTLE_MS = 300;

/**
 * The feed's heading with a search beside it. The magnifier opens a box; once it holds
 * enough to search for, the posts found stand in for the feed, which stays mounted under
 * `hidden` so the pages already fetched are there again when the search is cleared.
 * When the page is rendered anew (a like, a comment: `renderedAt` changes) the search is
 * asked again, so what was found shows the change too.
 */
export function FeedSearch({ renderedAt, children }: { renderedAt: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ for: string; found: FeedSearchResult } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);

  const term = query.trim().replace(/\s+/g, " ");
  const searching = open && term.length >= FEED_SEARCH_MIN;

  useEffect(() => {
    if (!searching) return;
    const id = ++asked.current;
    const timer = setTimeout(() => {
      searchFeed(term)
        .then((found) => {
          if (id === asked.current) setResult({ for: term, found });
        })
        .catch(() => {});
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [searching, term, renderedAt]);

  function close() {
    setOpen(false);
    setQuery("");
    setResult(null);
  }

  const shown = searching && result?.for === term ? result.found : null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        {open ? (
          <form role="search" onSubmit={(event) => event.preventDefault()} className="flex flex-1 items-center gap-2">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-full bg-white px-3.5 ring-1 ring-slate-200 focus-within:ring-[var(--accent)]">
              <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={input}
                type="search"
                aria-label="Søg i feedet"
                placeholder="Søg i opslag, navne og kommentarer"
                maxLength={FEED_SEARCH_MAX}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && close()}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
            <button type="button" onClick={close} className="press-button h-10 rounded-full px-2 text-sm font-medium text-[var(--accent-text)]">
              Luk
            </button>
          </form>
        ) : (
          <>
            <h2 className="shrink-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">Feed</h2>
            <button
              type="button"
              aria-label="Søg i feedet"
              onClick={() => setOpen(true)}
              // Pulled into the heading's own line, so the feed starts where it always has.
              className="press-icon -my-2 -mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {searching && (
        <section aria-label="Søgeresultater" aria-live="polite" className="space-y-6">
          {!shown ? (
            <SkeletonBlock className="h-40" />
          ) : shown.count === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Ingen opslag med »{term}«.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {shown.limited
                  ? `De ${FEED_SEARCH_LIMIT} nyeste opslag med »${term}«`
                  : shown.count === 1
                    ? `1 opslag med »${term}«`
                    : `${shown.count} opslag med »${term}«`}
              </p>
              {shown.posts}
            </>
          )}
        </section>
      )}
      <div hidden={searching}>{children}</div>
    </>
  );
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
