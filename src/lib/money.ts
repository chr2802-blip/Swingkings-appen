/**
 * Money in the fine box. Everything is whole kroner: one fine is `Team.finePriceKr`
 * (10 kr unless the team changes it), and a fine type costs a whole number of fines.
 */

/** "1.250 kr" — Danish thousands separator, no decimals. */
export function kr(amount: number) {
  return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(amount)} kr`;
}

/** "1 bøde" / "3 bøder". */
export function fineUnits(units: number) {
  return `${units} ${units === 1 ? "bøde" : "bøder"}`;
}

/** What a fine costs: its units at the price of one when it was given. */
export function fineAmount(fine: { units: number; unitPriceKr: number }) {
  return fine.units * fine.unitPriceKr;
}

export type Balance = {
  userId: string;
  /** What is outstanding: fines not yet reset, less what has been challenged away. */
  owesKr: number;
  /** The same, in fines. */
  units: number;
  /** Every fine ever given, reset or not — the "i alt" on the board. */
  finedKr: number;
};

type FineRow = { playerId: string; units: number; unitPriceKr: number; clearedAt: Date | null };

/**
 * Each player's account. Nobody pays: a fine is outstanding until the treasurer resets
 * it (`clearedAt`), or until it is challenged away — a won challenge is a fine with
 * negative units. Everybody in `userIds` gets a row, so a clean sheet is on the board
 * too. Never below zero. Sorted by who owes most.
 */
export function balances(userIds: string[], fines: FineRow[]): Balance[] {
  const rows = new Map<string, Balance>(userIds.map((userId) => [userId, { userId, owesKr: 0, units: 0, finedKr: 0 }]));
  const row = (userId: string) => {
    let found = rows.get(userId);
    if (!found) {
      // Somebody fined while on the team who has since left still owes it.
      found = { userId, owesKr: 0, units: 0, finedKr: 0 };
      rows.set(userId, found);
    }
    return found;
  };
  for (const fine of fines) {
    const r = row(fine.playerId);
    if (fine.units > 0) r.finedKr += fineAmount(fine);
    if (fine.clearedAt) continue;
    r.owesKr += fineAmount(fine);
    r.units += fine.units;
  }
  for (const r of rows.values()) {
    r.owesKr = Math.max(0, r.owesKr);
    r.units = Math.max(0, r.units);
  }
  return [...rows.values()].sort((a, b) => b.owesKr - a.owesKr || b.finedKr - a.finedKr);
}

/**
 * Who has been fined most (in kroner) among `fines` — the month's "bødekonge". Ties
 * share the crown, so it can be several people; nobody when there are no fines.
 */
export function fineKings(fines: { playerId: string; units: number; unitPriceKr: number }[]) {
  const totals = new Map<string, number>();
  // A won challenge (negative units) takes fines off the account, not off the crown.
  for (const fine of fines.filter((f) => f.units > 0)) totals.set(fine.playerId, (totals.get(fine.playerId) ?? 0) + fineAmount(fine));
  const top = Math.max(0, ...totals.values());
  if (top === 0) return { userIds: [] as string[], kr: 0 };
  return { userIds: [...totals].filter(([, sum]) => sum === top).map(([id]) => id).sort(), kr: top };
}
