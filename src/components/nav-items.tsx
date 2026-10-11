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
    href: "/kampe",
    label: "Kampe",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 3-1.5 4.5h-5L8 10z" />
        <path d="M12 3v4M21 10l-5 0M18 19l-3.5-4.5M6 19l3.5-4.5M3 10h5" />
      </svg>
    ),
  },
  {
    href: "/opgaver",
    label: "Opgaver",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <path d="m3 6 1.6 1.6L7.5 4.7" />
        <path d="m3 13 1.6 1.6 2.9-2.9" />
        <path d="m3 20 1.6 1.6 2.9-2.9" />
        <path d="M11 6.5h10M11 13.5h10M11 20.5h10" />
      </svg>
    ),
  },
  {
    href: "/feed",
    label: "Feed",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} {...stroke}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5-8 9" />
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

export function isInTab(item: NavItem, pathname: string) {
  return [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}
