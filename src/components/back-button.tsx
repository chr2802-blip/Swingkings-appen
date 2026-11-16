"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { backHref } from "@/lib/back-link";
import { followFinger, letsGoBack, startsAtEdge, swipeIntent } from "@/lib/edge-swipe";
import { isStandalone } from "@/lib/install-client";
import { PAGE_ID, PageLeaving, closeNext } from "./page-transition";

/**
 * How many pages of the app lie behind the one on screen, in this tab of the browser.
 * A new page adds one and the browser's back takes one away. Only while it is above zero
 * does the arrow step back in history; otherwise "back" would leave the app.
 */
let behind = 0;

/** How long the page takes to slide the rest of the way out, or back, after the finger lets go. */
const SETTLE_MS = 200;
/** A page slid out whose way back never came (nothing to go to) is put back after this. */
const STRANDED_MS = 1500;

const arrow = (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

/**
 * The back arrow in the top bar on a detail page. It steps back to wherever you came from
 * — the overview, the fines, an activity — as the browser's back would; with nothing of
 * the app behind it, it goes to the page above (`backHref`). An installed app on a phone
 * has no back button of its own, so the arrow, and the swipe in from the left edge
 * (`useEdgeSwipe`), are the way back there.
 *
 * It is always mounted, also where it shows nothing, so it counts every page; and its
 * place in the header is always there, so the arrow slides in and out instead of the
 * team's name jumping aside.
 */
export function BackButton({ profileHref }: { profileHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const last = useRef(pathname);
  const popped = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      popped.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    // A sheet's own history entry pops on the same address; only a pop that lands here counts.
    if (popped.current === pathname) behind = Math.max(0, behind - 1);
    else behind += 1;
    popped.current = null;
  }, [pathname]);

  const href = backHref(pathname, profileHref);

  /** Back, without the arrow's link: for the swipe. */
  const goBack = useCallback(() => {
    if (!href) return;
    closeNext();
    if (behind > 0) window.history.back();
    else router.push(href);
  }, [href, router]);

  useEdgeSwipe(href ? goBack : null, pathname);

  return (
    <span className="back-slot" data-shown={href ? "" : undefined}>
      {href ? (
        <Link
          href={href}
          aria-label="Tilbage"
          onClick={(event) => {
            closeNext();
            if (behind === 0) return;
            event.preventDefault();
            window.history.back();
          }}
          className="press-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--band-text)] hover:bg-[var(--band-hover)]"
        >
          {arrow}
          <PageLeaving motion="close" />
        </Link>
      ) : (
        // Fading out: only a picture of the arrow, for nobody to press or read.
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--band-text)]" aria-hidden>
          {arrow}
        </span>
      )}
    </span>
  );
}

function pageElement() {
  return document.getElementById(PAGE_ID);
}

function clearDrag(el: HTMLElement) {
  el.style.removeProperty("translate");
  el.style.removeProperty("opacity");
  el.style.removeProperty("transition");
  delete el.dataset.dragging;
}

/**
 * In the installed app, a finger that starts at the left edge and moves right drags the
 * page with it; let go far or fast enough (`letsGoBack`) and it slides out and `goBack`
 * runs, else it slides back. In a browser the phone has its own back swipe, so nothing
 * here listens; nor while a sheet is open, or where there is nothing to go back to.
 */
function useEdgeSwipe(goBack: (() => void) | null, pathname: string) {
  const back = useRef(goBack);
  back.current = goBack;
  const stranded = useRef(0);

  // The page that slid out is the same element the next page comes into: it lets go of
  // the swipe's position just as the new page's own motion starts.
  useLayoutEffect(() => {
    window.clearTimeout(stranded.current);
    const el = pageElement();
    if (el?.dataset.dragging !== undefined) clearDrag(el);
  }, [pathname]);

  useEffect(() => {
    if (!isStandalone()) return;
    let touch: { x: number; y: number; lastX: number; lastT: number; speed: number; intent: ReturnType<typeof swipeIntent> } | null = null;

    const start = (event: TouchEvent) => {
      touch = null;
      const point = event.touches[0];
      if (event.touches.length !== 1 || !back.current || !startsAtEdge(point.clientX)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      touch = { x: point.clientX, y: point.clientY, lastX: point.clientX, lastT: event.timeStamp, speed: 0, intent: "undecided" };
    };

    const move = (event: TouchEvent) => {
      if (!touch) return;
      const point = event.touches[0];
      const dx = point.clientX - touch.x;
      if (touch.intent === "undecided") {
        touch.intent = swipeIntent(dx, point.clientY - touch.y);
        if (touch.intent === "other") {
          touch = null;
          return;
        }
      }
      if (touch.intent !== "back") return;
      event.preventDefault(); // the page, not the scroll, follows the finger
      const el = pageElement();
      if (!el) return;
      const dt = event.timeStamp - touch.lastT;
      if (dt > 0) touch.speed = (point.clientX - touch.lastX) / dt;
      touch.lastX = point.clientX;
      touch.lastT = event.timeStamp;
      const shift = followFinger(dx);
      el.dataset.dragging = "";
      el.style.transition = "none";
      el.style.translate = `${shift}px 0`;
      el.style.opacity = String(1 - 0.4 * Math.min(1, shift / window.innerWidth));
    };

    const end = () => {
      const done = touch;
      touch = null;
      const el = pageElement();
      if (!done || done.intent !== "back" || !el) return;
      const dx = followFinger(done.lastX - done.x);
      const width = window.innerWidth;
      el.style.transition = `translate ${SETTLE_MS}ms var(--ease-arrive), opacity ${SETTLE_MS}ms ease-out`;
      if (letsGoBack(dx, width, done.speed)) {
        el.style.translate = `${width}px 0`;
        el.style.opacity = "0.6";
        back.current?.();
        // Normally the new page arrives and takes the page back; should none come, put it back.
        stranded.current = window.setTimeout(() => {
          el.style.translate = "0px 0";
          el.style.opacity = "1";
          window.setTimeout(() => clearDrag(el), SETTLE_MS);
        }, STRANDED_MS);
      } else {
        el.style.translate = "0px 0";
        el.style.opacity = "1";
        window.setTimeout(() => clearDrag(el), SETTLE_MS);
      }
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, []);
}
