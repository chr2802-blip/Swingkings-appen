/**
 * Which way a page comes in when the address changes. The tabs sit side by side in the
 * tab bar, so going to a tab further right brings its page in from the right ("forward")
 * and one further left from the left ("backward"). Inside a tab, a page deeper down opens
 * out of the one before it ("open") and going back up closes it ("close"). Pages outside
 * the tabs (the profile, a player, the team's settings) open over wherever one was.
 */
export type PageMotion = "forward" | "backward" | "open" | "close";

/** A tab is the paths that belong to it, its own first. */
export type TabPaths = readonly (readonly string[])[];

function tabOf(pathname: string, tabs: TabPaths) {
  return tabs.findIndex((paths) => paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)));
}

function depth(pathname: string) {
  return pathname.split("/").filter(Boolean).length;
}

export function pageMotion(from: string, to: string, tabs: TabPaths): PageMotion | null {
  if (from === to) return null;
  const a = tabOf(from, tabs);
  const b = tabOf(to, tabs);
  if (b < 0) return "open";
  if (a < 0) return "close";
  if (a !== b) return b > a ? "forward" : "backward";
  const down = depth(to) - depth(from);
  if (down === 0) return null;
  return down > 0 ? "open" : "close";
}
