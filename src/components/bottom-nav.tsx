"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLeaveHome } from "./home-banner";
import { NAV_ITEMS, isInTab } from "./nav-items";

type Pill = { x: number; y: number; moved: boolean };

/**
 * The phone's tab bar, with a gap in the middle for the page's "+" button. On a desktop
 * the same destinations are `NavLinks` in the header.
 *
 * A tab lights up the moment it is tapped, not when its page has arrived: the tapped tab
 * holds until the address changes. One highlight glides between the tabs; until it has
 * been measured, the active tab draws its own, so the first paint is right.
 */
export function BottomNav() {
  const pathname = usePathname();
  const leaveHome = useLeaveHome(pathname);
  // The tab tapped while still on `from`; forgotten as soon as the address moves on.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const shown = tapped && tapped.from === pathname ? tapped.href : null;
  const activeIndex = shown ? NAV_ITEMS.findIndex((item) => item.href === shown) : NAV_ITEMS.findIndex((item) => isInTab(item, pathname));

  const list = useRef<HTMLUListElement>(null);
  const icons = useRef<(HTMLSpanElement | null)[]>([]);
  const [pill, setPill] = useState<Pill | null>(null);

  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const measure = () => {
      const icon = icons.current[activeIndex];
      if (!icon) return setPill(null);
      const box = icon.getBoundingClientRect();
      const frame = ul.getBoundingClientRect();
      const x = box.left - frame.left + box.width / 2;
      const y = box.top - frame.top + box.height / 2;
      // The first placement does not glide in from nowhere.
      setPill((last) => (last && last.x === x && last.y === y ? last : { x, y, moved: last !== null }));
    };
    measure();
    // The tabs move when the gap for the "+" opens or closes, and when the screen turns.
    const observer = new ResizeObserver(measure);
    for (const li of ul.children) observer.observe(li);
    return () => observer.disconnect();
  }, [activeIndex]);

  return (
    <nav className="app-bottombar bg-[var(--band)] fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-[var(--band-line)] shadow-[0_-10px_28px_-18px_rgb(40_50_30/0.45)] md:hidden">
      <ul ref={list} className="relative mx-auto flex max-w-lg items-stretch pb-[env(safe-area-inset-bottom)]">
        {pill && activeIndex >= 0 && (
          <li
            aria-hidden
            data-testid="tab-pill"
            className={`pointer-events-none absolute top-0 left-0 h-7 w-11 rounded-full bg-[var(--band-active)] ${pill.moved ? "app-pill" : ""}`}
            style={{ translate: `${pill.x - 22}px ${pill.y - 14}px`, scale: "1.1" }}
          />
        )}
        {NAV_ITEMS.map((item, index) => {
          const active = index === activeIndex;
          const Icon = item.icon;
          return (
            <Fragment key={item.href}>
              {/* The middle, kept free for the page's "+" (`CreateFab`), only while it has one. */}
              {index === NAV_ITEMS.length / 2 && <li aria-hidden className="app-create-gap w-16 shrink-0" />}
              <li className="relative min-w-0 flex-1">
                <Link
                  href={item.href}
                  onClick={(event) => {
                    if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) {
                      setTapped({ href: item.href, from: pathname });
                    }
                    leaveHome(event, item.href);
                  }}
                  aria-current={active ? "page" : undefined}
                  className="press-icon flex flex-col items-center gap-1 px-0.5 pt-2.5 pb-2"
                >
                  <span
                    ref={(el) => {
                      icons.current[index] = el;
                    }}
                    className={`flex h-7 w-11 items-center justify-center rounded-full transition-[background-color,color,scale] duration-(--dur-base) ease-(--ease-spring) ${
                      active ? `scale-110 text-[var(--band-active-text)] ${pill ? "" : "bg-[var(--band-active)]"}` : "scale-100 text-[var(--band-muted)]"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span
                    className={`text-[11px] leading-none font-medium transition-colors duration-(--dur-base) ${active ? "font-semibold text-[var(--band-active-label)]" : "text-[var(--band-muted)]"}`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
