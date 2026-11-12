"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How far a scroll has to go in one direction before the bars move. */
const THRESHOLD = 12;
/** Near the top of the page the bars always show. */
const TOP = 64;

/**
 * Slides the header and the tab bar away while the reader scrolls down and back when they
 * scroll up, by setting `data-bars="hidden"` on `<html>` (the CSS is in globals.css).
 * They come back on a new page and at the top of one.
 */
export function ScrollBars() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    let anchor = window.scrollY;
    let hidden = false;
    let frame = 0;

    const set = (hide: boolean) => {
      if (hide === hidden) return;
      hidden = hide;
      if (hide) root.dataset.bars = "hidden";
      else delete root.dataset.bars;
    };

    const update = () => {
      frame = 0;
      // iOS bounces past both ends; read the position clamped to the page.
      const max = Math.max(0, root.scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(window.scrollY, 0), max);
      if (y < TOP) {
        set(false);
        anchor = y;
        return;
      }
      const moved = y - anchor;
      if (moved > THRESHOLD) {
        set(true);
        anchor = y;
      } else if (moved < -THRESHOLD) {
        set(false);
        anchor = y;
      } else if ((hidden && moved > 0) || (!hidden && moved < 0)) {
        // Still going the same way: keep the anchor at the furthest point reached.
        anchor = y;
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    set(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.bars;
    };
  }, [pathname]);

  return null;
}
