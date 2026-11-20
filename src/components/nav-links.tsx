"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLeaveBanner } from "./home-banner";
import { ADMIN_ITEM, NAV_ITEMS, TAB_PATHS, isInTab } from "./nav-items";
import { PageLeaving } from "./page-transition";
import { pageMotion } from "@/lib/page-motion";

export function NavLinks({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const leaveBanner = useLeaveBanner();
  // The header's avatar is the profile here.
  const tabs = NAV_ITEMS.filter((item) => !item.profile);
  const items = showAdmin ? [...tabs, ADMIN_ITEM] : tabs;
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {items.map((item) => {
        const active = isInTab(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(event) => leaveBanner(event, item.href)}
            aria-current={active ? "page" : undefined}
            className={`press-button rounded-lg px-3 py-1.5 ${
              active ? "bg-[var(--band-active)] font-medium text-[var(--band-active-text)]" : "text-[var(--band-soft)] hover:bg-[var(--band-hover)]"
            }`}
          >
            {item.label}
            <PageLeaving motion={pageMotion(pathname, item.href, TAB_PATHS)} />
          </Link>
        );
      })}
    </nav>
  );
}
