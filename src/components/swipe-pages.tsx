"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

export type SwipePage = {
  /** Where this page lives; the address bar follows the swipe, so a reload stays put. */
  href: string;
  title: string;
  /** The header's button while this page is the one shown. */
  action?: React.ReactNode;
  children: React.ReactNode;
};

const GoTo = createContext<(href: string) => void>(() => {});

/** How long the scroller must be still before the page it stopped on is the page. */
const SETTLE_MS = 120;
/** A tap on a dot scrolls there; if the browser never arrives, it is put there. */
const ARRIVE_MS = 1500;

/**
 * Pages side by side that a finger swipes between, with the title, the header's button
 * and a row of dots following along. The dots are the tabs: tap one, or use them from a
 * keyboard, where there is nothing to swipe with.
 *
 * The pages sit in a row that scrolls sideways and snaps, so the swipe is the browser's
 * own and follows the finger. At rest the pages not shown are collapsed and invisible:
 * the document is as tall as the page shown, and the others are out of the tab order.
 * They are shown again when a finger lands, and put away when the scroller has stopped.
 *
 * Until the script has run there is no row, only the page asked for — so the first paint
 * is right whichever address was opened.
 */
export function SwipePages({ pages, initial = 0 }: { pages: SwipePage[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  const [resting, setResting] = useState(true);
  const [ready, setReady] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // What the listeners read: they are attached once and outlive any one render.
  const live = useRef({ active, resting, touching: false, target: null as number | null, timer: 0, deadline: 0 });
  live.current.active = active;
  live.current.resting = resting;

  const settle = useCallback(() => {
    const el = scroller.current;
    const now = live.current;
    window.clearTimeout(now.timer);
    if (!el || now.resting || now.touching) return;
    const width = el.clientWidth || 1;
    if (now.target !== null) {
      // On the way to a tapped dot: wait until it is there, but not for ever.
      if (Math.abs(el.scrollLeft - now.target * width) > 2 && Date.now() < now.deadline) {
        now.timer = window.setTimeout(settle, SETTLE_MS);
        return;
      }
    }
    const index = now.target ?? Math.min(pages.length - 1, Math.max(0, Math.round(el.scrollLeft / width)));
    const changed = index !== now.active;
    now.target = null;
    flushSync(() => {
      setActive(index);
      setResting(true);
    });
    if (changed) {
      // The new page starts at its top; the old page's scroll position means nothing on it.
      window.scrollTo({ top: 0 });
      window.history.replaceState(null, "", pages[index].href);
    }
  }, [pages]);

  /** Shows the neighbours, ready to be swiped to. */
  const open = useCallback(() => {
    if (live.current.resting) flushSync(() => setResting(false));
  }, []);

  // Before the first paint with the row: stand on the page that was asked for.
  useLayoutEffect(() => setReady(true), []);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (ready && el) el.scrollLeft = live.current.active * el.clientWidth;
  }, [ready]);

  const goTo = useCallback(
    (index: number) => {
      const el = scroller.current;
      const now = live.current;
      if (!el || index === now.active || index < 0 || index >= pages.length) return;
      open();
      now.target = index;
      now.deadline = Date.now() + ARRIVE_MS;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: index * el.clientWidth, behavior: calm ? "auto" : "smooth" });
      window.clearTimeout(now.timer);
      now.timer = window.setTimeout(settle, SETTLE_MS);
    },
    [open, pages.length, settle],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const now = live.current;
    const wait = () => {
      window.clearTimeout(now.timer);
      now.timer = window.setTimeout(settle, SETTLE_MS);
    };
    // A trackpad or a keyboard scrolls the row without ever touching it.
    const scrolled = () => {
      if (Math.abs(el.scrollLeft - now.active * el.clientWidth) > 2) open();
      wait();
    };
    const down = () => {
      now.touching = true;
      now.target = null;
      window.clearTimeout(now.timer);
      open();
    };
    const up = () => {
      now.touching = false;
      wait();
    };
    // Native listeners on purpose: a dialog is a portal, and React would bubble its touches here.
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", up, { passive: true });
    el.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      window.clearTimeout(now.timer);
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
      el.removeEventListener("scroll", scrolled);
    };
  }, [open, settle]);

  const goToHref = useCallback((href: string) => goTo(pages.findIndex((page) => page.href === href)), [goTo, pages]);

  return (
    <GoTo.Provider value={goToHref}>
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words">{pages[active].title}</h1>
        {pages.map(
          (page, index) =>
            page.action && (
              <div key={page.href} hidden={index !== active} className={index === active ? "flex shrink-0 gap-2" : undefined}>
                {page.action}
              </div>
            ),
        )}
      </div>

      <div role="tablist" aria-label="Bødekassens sider" className="mb-4 flex justify-center">
        {pages.map((page, index) => (
          <button
            key={page.href}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-label={page.title}
            onClick={() => goTo(index)}
            className="px-1.5 py-2"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-200 ${
                index === active ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-slate-300"
              }`}
            />
          </button>
        ))}
      </div>

      {/*
        The gutter between two pages mid-swipe is the page's own margin, pulled in and put back.
        The row reaches the bottom of the screen, so a short page can be swiped below its content.
      */}
      <div
        ref={scroller}
        className={ready ? "scrollbar-hidden -mx-4 flex min-h-[calc(100dvh-20rem)] snap-x snap-mandatory overflow-x-auto overscroll-x-contain" : ""}
      >
        {pages.map((page, index) => {
          const away = resting && index !== active;
          return (
            <div
              key={page.href}
              role="tabpanel"
              aria-label={page.title}
              hidden={!ready && away}
              className={ready ? `w-full shrink-0 snap-start snap-always px-4 pb-4 ${away ? "invisible h-0 overflow-hidden" : ""}` : ""}
            >
              {page.children}
            </div>
          );
        })}
      </div>
    </GoTo.Provider>
  );
}

/** A link to one of the pages from inside another: slides there instead of loading it. */
export function SwipeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const goTo = useContext(GoTo);
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        goTo(href);
      }}
    >
      {children}
    </a>
  );
}
