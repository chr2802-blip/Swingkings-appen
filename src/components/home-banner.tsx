"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { leavesScope } from "@/lib/page-motion";

/**
 * A page's banner, edge to edge under the header: the front page's greeting and a player's
 * card. It rolls down out of the header when the page opens, and the page below it follows
 * it down; when a menu item leads away it rolls back up into the header and the page below
 * fades (`useLeaveBanner`). The CSS is `.page-banner` in globals.css.
 */
const LEAVE = "swingkings:leave-banner";
/** How long the banner takes to roll up; navigation waits for it. Matches `banner-up`. */
const LEAVE_MS = 220;

export function PageBanner({
  children,
  className,
  scope,
}: {
  children: React.ReactNode;
  /** What it is dressed in: the crest's stripes on the front page, the team's colour on a player. */
  className: string;
  /** The page's own addresses (its tabs too): going to one of them does not roll it up. */
  scope: string;
}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const onLeave = () => setLeaving(true);
    window.addEventListener(LEAVE, onLeave);
    return () => window.removeEventListener(LEAVE, onLeave);
  }, []);
  return (
    <div className={`page-banner ${className}`} data-scope={scope} data-leaving={leaving || undefined}>
      {children}
    </div>
  );
}

/** The front page's banner, in the crest's stripes. */
export function HomeBanner({ children }: { children: React.ReactNode }) {
  return (
    <PageBanner className="stripes-fine" scope="/oversigt">
      {children}
    </PageBanner>
  );
}

/**
 * A click handler for menu links: leaving a page with a banner, it rolls the banner up
 * first and then navigates. On a page without one, to one of the page's own addresses,
 * with a modifier key, or with reduced motion it does nothing and the link behaves as a link.
 */
export function useLeaveBanner() {
  const router = useRouter();
  return (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const banner = document.querySelector<HTMLElement>(".page-banner");
    if (!banner || banner.dataset.leaving !== undefined) return;
    if (!leavesScope(href, banner.dataset.scope ?? "")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    router.prefetch(href);
    window.dispatchEvent(new Event(LEAVE));
    window.setTimeout(() => router.push(href), LEAVE_MS);
  };
}
