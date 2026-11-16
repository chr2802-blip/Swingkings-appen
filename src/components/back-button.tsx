"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { backHref } from "@/lib/back-link";
import { PageLeaving, closeNext } from "./page-transition";

/**
 * How many pages of the app lie behind the one on screen, in this tab of the browser.
 * A new page adds one and the browser's back takes one away. Only while it is above zero
 * does the arrow step back in history; otherwise "back" would leave the app.
 */
let behind = 0;

/**
 * The back arrow in the top bar on a detail page. It steps back to wherever you came from
 * — the overview, the fines, an activity — as the browser's back would; with nothing of
 * the app behind it, it goes to the page above (`backHref`). An installed app on a phone
 * has no back button of its own, so this is the only way back there.
 *
 * It is always mounted, also where it shows nothing, so it counts every page.
 */
export function BackButton({ profileHref }: { profileHref: string }) {
  const pathname = usePathname();
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
  if (!href) return null;

  return (
    <Link
      href={href}
      aria-label="Tilbage"
      onClick={(event) => {
        closeNext();
        if (behind === 0) return;
        event.preventDefault();
        window.history.back();
      }}
      className="press-icon -ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--band-text)] hover:bg-[var(--band-hover)]"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 5-7 7 7 7" />
      </svg>
      <PageLeaving motion="close" />
    </Link>
  );
}
