import { prisma } from "./prisma";

/**
 * Clubs' crests (`ClubLogo`), put in by the super admin and shared by every team: the
 * opponent's on the match-day poster. A club is found by its name folded — case, accents,
 * dots and spaces away — so "B.93", "b93" and "B 93" are one club. KampKlar sometimes
 * writes a club's second or third team as "Hvidovre IF (2)" or "Hvidovre IF 2"; those find
 * the club's crest too, unless that team has one of its own.
 */

/** The largest crest kept: a crest, not a photo. */
export const MAX_LOGO_BYTES = 300_000;

/** "Brønshøj BK" → "brønshøjbk", "B.93" → "b93", "Østerbro IF" → "østerbroif". */
export function clubKey(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** The keys a name is looked up by, the best first: itself, then without a team number. */
export function clubKeys(name: string) {
  const own = clubKey(name);
  const club = clubKey(name.replace(/\s*\(\s*\d{1,2}\s*\)\s*$/, "").replace(/\s+(?:\d|I{1,3})$/, ""));
  return [...new Set([own, club])].filter(Boolean);
}

/** The address a crest is served from, behind the session. */
export function logoUrl(id: string) {
  return `/api/club-logos/${id}`;
}

/**
 * The crest for each of `names` that has one: name → its address. Crosses teams on
 * purpose (a crest is everybody's), so `prisma` directly.
 */
export async function clubLogos(names: (string | null | undefined)[]) {
  const wanted = names.filter((name): name is string => Boolean(name));
  const keys = [...new Set(wanted.flatMap(clubKeys))];
  if (keys.length === 0) return new Map<string, string>();
  const rows = await prisma.clubLogo.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  const byKey = new Map(rows.map((row) => [row.key, row.id]));
  const found = new Map<string, string>();
  for (const name of wanted) {
    const id = clubKeys(name)
      .map((key) => byKey.get(key))
      .find(Boolean);
    if (id) found.set(name, logoUrl(id));
  }
  return found;
}
