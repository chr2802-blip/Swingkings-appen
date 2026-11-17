/**
 * A name in the genitive, the Danish way: "Annas", "Bos" — and "Mads'", "Max'", "Fritz'"
 * for a name that already ends in s, x or z.
 */
export function possessive(name: string): string {
  const trimmed = name.trim();
  return /[sxz]$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}s`;
}
