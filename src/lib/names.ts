/**
 * A name in the genitive, the Danish way: "Annas", "Bos" — and "Mads'", "Max'", "Fritz'"
 * for a name that already ends in s, x or z.
 */
export function possessive(name: string): string {
  const trimmed = name.trim();
  return /[sxz]$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}s`;
}

/** Shown where somebody who has deleted their account once stood, e.g. as the giver of a fine. */
export const DELETED_USER = "Slettet bruger";
