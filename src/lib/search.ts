/**
 * Searching a list of choices as a person types: case and accents do not matter
 * ("ae" is not "æ", but "é" is "e"), and every word typed must be found somewhere in the
 * label, in any order — "naboen ude" finds "Ude: FC Naboen".
 */

/** The label as it is compared: lower case, accents off, spaces collapsed. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("da")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether `label` answers `query`; an empty query answers everything. */
export function matchesSearch(label: string, query: string): boolean {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const key = searchKey(label);
  return words.every((word) => key.includes(word));
}

/** The choices that answer `query`, in their own order. */
export function searchChoices<T extends { label: string }>(choices: T[], query: string): T[] {
  return choices.filter((choice) => matchesSearch(choice.label, query));
}
