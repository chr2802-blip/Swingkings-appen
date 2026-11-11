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

export type Balance = { userId: string; finedKr: number; paidKr: number; owesKr: number; fines: number };

/**
 * Each player's account: what they have been fined, what they have paid, and the
 * difference. Everybody in `userIds` gets a row, so a player with a clean sheet is on
 * the board too. Sorted by who owes most.
 */
export function balances(
  userIds: string[],
  fines: { playerId: string; units: number; unitPriceKr: number }[],
  payments: { playerId: string; amountKr: number }[],
): Balance[] {
  const rows = new Map<string, Balance>(
    userIds.map((userId) => [userId, { userId, finedKr: 0, paidKr: 0, owesKr: 0, fines: 0 }]),
  );
  const row = (userId: string) => {
    let found = rows.get(userId);
    if (!found) {
      // Somebody fined while on the team who has since left still owes it.
      found = { userId, finedKr: 0, paidKr: 0, owesKr: 0, fines: 0 };
      rows.set(userId, found);
    }
    return found;
  };
  for (const fine of fines) {
    const r = row(fine.playerId);
    r.finedKr += fineAmount(fine);
    r.fines += 1;
  }
  for (const payment of payments) row(payment.playerId).paidKr += payment.amountKr;
  for (const r of rows.values()) r.owesKr = r.finedKr - r.paidKr;
  return [...rows.values()].sort((a, b) => b.owesKr - a.owesKr || b.finedKr - a.finedKr);
}

/**
 * Who has been fined most (in kroner) among `fines` — the month's "bødekonge". Ties
 * share the crown, so it can be several people; nobody when there are no fines.
 */
export function fineKings(fines: { playerId: string; units: number; unitPriceKr: number }[]) {
  const totals = new Map<string, number>();
  for (const fine of fines) totals.set(fine.playerId, (totals.get(fine.playerId) ?? 0) + fineAmount(fine));
  const top = Math.max(0, ...totals.values());
  if (top === 0) return { userIds: [] as string[], kr: 0 };
  return { userIds: [...totals].filter(([, sum]) => sum === top).map(([id]) => id).sort(), kr: top };
}
