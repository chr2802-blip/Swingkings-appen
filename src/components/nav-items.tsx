export type NavItem = {
  href: string;
  /** Other paths that belong to this tab. */
  also?: string[];
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/oversigt",
    label: "Hjem",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
      </svg>
    ),
  },
  {
    href: "/boder",
    label: "Bøder",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V7" />
        <circle cx="12" cy="13.5" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/aktiviteter",
    also: ["/opgaver", "/kampe"],
    label: "Aktiviteter",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
        <path d="m9 15 2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z" />
      </svg>
    ),
  },
];

export const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  ),
};

/** The tabs in the order they sit in the menu, for which way a page comes in (`pageMotion`). */
export const TAB_PATHS = [...NAV_ITEMS, ADMIN_ITEM].map((item) => [item.href, ...(item.also ?? [])]);

export function isInTab(item: NavItem, pathname: string) {
  return [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}
