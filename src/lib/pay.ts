/**
 * Paying through the team's MobilePay Box. MobilePay Box has no API: the app can only say
 * where to pay, how much and what to write, and nobody is marked paid by it — an admin
 * ticks kontingent off, and the treasurer resets (nulstiller) the fines, once they have
 * seen the money in the box.
 */

/**
 * A box number as typed — "9162tv", " 9162 TV " — or null when it cannot be one. A box
 * number is a few letters and digits; spaces are dropped and letters made capitals.
 */
export function normalizeBox(input: string): string | null {
  const box = input.replace(/\s+/g, "").toUpperCase();
  return /^[0-9A-Z]{4,12}$/.test(box) ? box : null;
}

export type PayKind = "fines" | "dues";

/** What to write in the payment's message, so whoever checks the box knows who paid for what. */
export function paymentMessage(kind: PayKind, name: string) {
  return `${kind === "fines" ? "Bøder" : "Kontingent"} – ${name}`;
}

/** Who looks at the box afterwards, as the payment sheet tells it. */
export function afterPaying(kind: PayKind) {
  return kind === "fines"
    ? "Bødekassen nulstiller dine bøder, når betalingen er set i boxen."
    : "En admin markerer dit kontingent som betalt, når betalingen er set i boxen.";
}
