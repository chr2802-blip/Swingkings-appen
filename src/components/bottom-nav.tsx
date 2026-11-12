"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLeaveHome } from "./home-banner";
import { NAV_ITEMS, isInTab } from "./nav-items";

/** The phone's tab bar. On a desktop the same destinations are `NavLinks` in the header. */
export function BottomNav() {
  const pathname = usePathname();
  const leaveHome = useLeaveHome(pathname);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-[var(--band-line)] bg-[var(--band)] shadow-[0_-10px_28px_-18px_rgb(40_50_30/0.45)] md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const active = isInTab(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                onClick={(event) => leaveHome(event, item.href)}
                aria-current={active ? "page" : undefined}
                className="press-icon flex flex-col items-center gap-1 px-0.5 pt-2.5 pb-2"
              >
                <span
                  className={`flex h-7 w-11 items-center justify-center rounded-full transition-[background-color,color,scale] duration-(--dur-base) ease-(--ease-spring) ${
                    active ? "scale-110 bg-[var(--band-active)] text-[var(--band-active-text)]" : "scale-100 text-[var(--band-muted)]"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={`text-[11px] leading-none font-medium ${active ? "font-semibold text-[var(--band-active-label)]" : "text-[var(--band-muted)]"}`}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
