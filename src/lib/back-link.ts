/**
 * Where the back arrow in the top bar leads when there is no page of the app behind this
 * one to step back to (the page was opened from a push message, a shared link or a fresh
 * start of the installed app). `null` means the page is one of the tabs, or something
 * else with nothing above it, and has no arrow.
 *
 * The tabs and the pages swiped between inside one (Bøder's history and catalogue) are
 * not details and get none; the team's settings, a player, an activity and a task do.
 */
export function backHref(pathname: string, profileHref: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const [first, second] = path.split("/").filter(Boolean);

  switch (first) {
    case "aktiviteter":
    case "kampe":
    case "opgaver":
      return second ? "/aktiviteter" : null;
    case "spiller":
      return second ? "/oversigt" : null;
    case "profil":
      // Somebody on no team has only the settings; there is nothing above them.
      return profileHref === "/profil" ? null : profileHref;
    case "hold":
      if (second === "vaelg") return null;
      if (second === "saeson") return "/hold";
      if (second === "saesoner") return "/hold/spillere";
      // The settings' own tabs, and the roster, are left for where they were opened from.
      return "/oversigt";
    default:
      return null;
  }
}
