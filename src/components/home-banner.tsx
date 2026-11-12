"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The front page's banner. It rolls down out of the header's stripes when the page opens,
 * and back up into them when a menu item leads away (`useLeaveHome`).
 */
const LEAVE = "swingkings:leave-home";
/** How long the banner takes to roll up; navigation waits for it. Matches `banner-up`. */
const LEAVE_MS = 220;

export function HomeBanner({ children }: { children: React.ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const onLeave = () => setLeaving(true);
    window.addEventListener(LEAVE, onLeave);
    return () => window.removeEventListener(LEAVE, onLeave);
  }, []);
  return (
    <div className="home-banner stripes-fine" data-leaving={leaving || undefined}>
      {children}
    </div>
  );
}

/**
 * A click handler for menu links: leaving the front page, it rolls the banner up first and
 * then navigates. Anywhere else, with a modifier key, or with reduced motion it does nothing
 * and the link behaves as a link.
 */
export function useLeaveHome(pathname: string) {
  const router = useRouter();
  return (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname !== "/oversigt" || href === "/oversigt") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!document.querySelector(".home-banner")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    router.prefetch(href);
    window.dispatchEvent(new Event(LEAVE));
    window.setTimeout(() => router.push(href), LEAVE_MS);
  };
}
