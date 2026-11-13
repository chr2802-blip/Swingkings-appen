"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How far a scroll goes while the bars travel all the way out (or in). */
const DISTANCE = 90;
/** Near the top of the page the bars always show. */
const TOP = 64;
/** How long the page must be still before the bars settle all the way in or out. */
const SETTLE_MS = 140;

/**
 * Moves the header, the tab bar and the "+" with the scroll: down a page they slide out as
 * far as the page has moved, back up they slide in, and when the scrolling stops they
 * settle the rest of the way, whichever way is nearer. They come back on a new page and at
 * the top of one.
 *
 * It writes `--bars` on <html> (0 shown, 1 gone; the CSS is in globals.css), and
 * `data-bars`: "hidden" once all the way out, "live" while following the finger, when
 * the CSS turns the bars' own easing off so they do not lag behind it.
 */
export function ScrollBars() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    let shown = 0; // how far out the bars are, 0..1
    let last = window.scrollY;
    let frame = 0;
    let timer = 0;

    const write = (next: number, live: boolean) => {
      shown = next;
      root.style.setProperty("--bars", String(next));
      if (live && next > 0 && next < 1) root.dataset.bars = "live";
      else if (next === 1) root.dataset.bars = "hidden";
      else delete root.dataset.bars;
    };

    const settle = () => write(shown >= 0.5 ? 1 : 0, false);

    const update = () => {
      frame = 0;
      // iOS bounces past both ends; read the position clamped to the page.
      const max = Math.max(0, root.scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(window.scrollY, 0), max);
      const moved = y - last;
      last = y;
      window.clearTimeout(timer);
      if (y < TOP) {
        write(0, false);
        return;
      }
      write(Math.min(1, Math.max(0, shown + moved / DISTANCE)), true);
      timer = window.setTimeout(settle, SETTLE_MS);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    write(0, false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      root.style.removeProperty("--bars");
      delete root.dataset.bars;
    };
  }, [pathname]);

  return null;
}
