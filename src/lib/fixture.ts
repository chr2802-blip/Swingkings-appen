/**
 * What the fixture poster (`src/components/fixture-card.tsx`) needs to draw a match like a
 * match: who is at home on the left, and a made-up crest for the opponent — their initials
 * on a shield whose colours come from the name, so B.93 wears the same colours every week.
 */

/** "Hvidovre IF" → "HIF", "B.93" → "B93", "Fremad Amager" → "FA", "Skovshoved" → "SKO". */
export function crestInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const [word] = words as [string];
    // A name with figures in it (B.93, AB 70) is already short and says itself.
    return (/\d/.test(word) ? word.slice(0, 4) : word.slice(0, 3)).toUpperCase();
  }
  // A club's suffix in capitals (IF, BK, FF) is kept whole; every other word gives its first letter.
  const letters = words.map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : word[0]!)).join("");
  return letters.slice(0, 4).toUpperCase();
}

/** Shield colours a name can be dressed in: the field, and the letters on it. */
export const CREST_COLOURS = [
  { field: "#b91c1c", text: "#fffffb" },
  { field: "#166534", text: "#fffffb" },
  { field: "#1d1c16", text: "#f5c72a" },
  { field: "#c2410c", text: "#fffffb" },
  { field: "#6d28d9", text: "#fffffb" },
  { field: "#0f766e", text: "#fffffb" },
  { field: "#f5c72a", text: "#1d1c16" },
  { field: "#7f1d1d", text: "#fde68a" },
] as const;

/** The same name always gets the same colours (a small string hash, not random). */
export function crestColours(name: string) {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return CREST_COLOURS[hash % CREST_COLOURS.length]!;
}

/**
 * The two sides in the order a fixture is written: the home side first. When nobody knows
 * who is at home (`isHome` null) we are first.
 */
export function fixtureSides(teamName: string, opponent: string, isHome: boolean | null) {
  const us = { name: teamName, us: true };
  const them = { name: opponent, us: false };
  return isHome === false ? [them, us] : [us, them];
}

/** The small word over the poster: where it is played. */
export function venueLabel(isHome: boolean | null) {
  return isHome === true ? "Hjemme" : isHome === false ? "Ude" : null;
}
