"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { pageMotion, type PageMotion } from "@/lib/page-motion";
import { TAB_PATHS } from "./nav-items";

const PAGE_ID = "app-page";

/** An address that was written by the page itself (a swipe), not arrived at: nothing comes in. */
let inPlace: string | null = null;

/**
 * How dimmed the page was when it stopped stepping aside, and when: the page that comes in
 * starts from there, so the screen never jumps to empty and back.
 */
let leftAt: { opacity: string; at: number } | null = null;
/** A page that let go longer ago than this did not let go for the page now coming in. */
const LEFT_JUST_NOW_MS = 100;

/** Called just before a page rewrites its own address, so the change is not read as a new page. */
export function stayOnPage(href: string) {
  inPlace = href;
}

/**
 * What every page of the app sits in. When the address changes, the new page comes in
 * from the side its tab is on, or opens and closes inside a tab (`pageMotion`); the CSS is
 * `.app-page` in globals.css. Nothing is remounted — the animation is started again on the
 * same element, so a page keeps its state when only its address moves.
 *
 * Back and forward bring nothing in: a phone draws its own slide for the back swipe, and
 * a second one on top of it reads as a stutter.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const page = useRef<HTMLDivElement>(null);
  const last = useRef(pathname);
  const popped = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      popped.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useLayoutEffect(() => {
    const el = page.current;
    const from = last.current;
    last.current = pathname;
    if (!el || from === pathname) return;
    const quiet = popped.current === pathname || inPlace === pathname;
    popped.current = null;
    inPlace = null;
    const motion = quiet ? null : pageMotion(from, pathname, TAB_PATHS);
    el.dataset.motion = motion ?? "none";
    const left = leftAt && performance.now() - leftAt.at < LEFT_JUST_NOW_MS ? leftAt.opacity : "1";
    leftAt = null;
    if (!motion) return;
    el.style.setProperty("--page-from", left);
    // The same way twice in a row is the same animation: stop it and let it start over.
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }, [pathname]);

  return (
    <div ref={page} id={PAGE_ID} data-testid="page" data-motion="first" className="app-page">
      {children}
    </div>
  );
}

/**
 * Inside a menu link: while the link's page is on its way, the page on screen dims, so a
 * tap answers at once and not when the server has. It only dims: a page that also moved
 * was cut off mid-move when the new one arrived, which read as a stutter.
 * It hangs on the link's own pending state, so it lets go whenever the navigation ends —
 * also one that ends where it began.
 */
export function PageLeaving({ motion }: { motion: PageMotion | null }) {
  const { pending } = useLinkStatus();
  useLayoutEffect(() => {
    const el = document.getElementById(PAGE_ID);
    if (!pending || !motion || !el) return;
    el.dataset.leaving = motion;
    return () => {
      leftAt = { opacity: getComputedStyle(el).opacity, at: performance.now() };
      delete el.dataset.leaving;
    };
  }, [pending, motion]);
  return null;
}
