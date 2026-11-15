export type NavItem = {
  href: string;
  /** Other paths that belong to this tab. */
  also?: string[];
  label: string;
  /** The person's own tab: its link goes to their page, which also lights it up. */
  profile?: boolean;
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
    // Your own page (`/spiller/<id>`) in the tab bar; the settings belong to the same tab.
    // The header's avatar is the way there on a desktop, so `NavLinks` leaves it out.
    href: "/profil",
    label: "Profil",
    profile: true,
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <circle cx="12" cy="8.5" r="4" />
        <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
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

/**
 * The tabs in the order they sit in the menu, for which way a page comes in (`pageMotion`).
 * The profile is left out: one's own page and its settings open over wherever one was, as
 * every person's page does, and "Rediger" opens the settings out of it.
 */
export const TAB_PATHS = [...NAV_ITEMS.filter((item) => !item.profile), ADMIN_ITEM].map((item) => [item.href, ...(item.also ?? [])]);

/** Where a tab's link goes: the profile tab to the person's own page. */
export function tabHref(item: NavItem, profileHref: string) {
  return item.profile ? profileHref : item.href;
}

export function isInTab(item: NavItem, pathname: string, profileHref?: string) {
  const own = item.profile && profileHref ? [profileHref] : [];
  return [item.href, ...(item.also ?? []), ...own].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}
