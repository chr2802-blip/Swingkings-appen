"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_ITEM, NAV_ITEMS, isInTab } from "./nav-items";

export function NavLinks({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const items = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {items.map((item) => {
        const active = isInTab(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`press-button rounded-lg px-3 py-1.5 ${
              active ? "bg-[var(--band-active)] font-medium text-[var(--band-active-text)]" : "text-[var(--band-soft)] hover:bg-[var(--band-hover)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
