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

const BOX_ID = /^\/box\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/pay-in\/?$/i;

/**
 * A box's pay-in link as pasted from MobilePay ("Del" on the box), or null when it is not
 * one. Kept to its address alone — whatever query it came with is dropped — so the app
 * only ever sends people to MobilePay's own page for that box.
 */
export function normalizeBoxLink(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const id = url.protocol === "https:" && url.hostname === "qr.mobilepay.dk" ? BOX_ID.exec(url.pathname)?.[1] : undefined;
  return id ? `https://qr.mobilepay.dk/box/${id.toLowerCase()}/pay-in` : null;
}

/**
 * The pay-in link with the amount filled in. MobilePay reads `amount` in øre: 30 kr is
 * `amount=3000`. Without an amount the box opens for the payer to type one.
 */
export function payLink(link: string, amountKr: number | null) {
  return amountKr && amountKr > 0 ? `${link}?amount=${Math.round(amountKr * 100)}` : link;
}

/** Where a team takes payments, or null when it has said nowhere. */
export function payTarget(team: { mobilePayBox: string | null; mobilePayLink: string | null }) {
  return team.mobilePayBox || team.mobilePayLink ? { box: team.mobilePayBox, link: team.mobilePayLink } : null;
}

export type PayTarget = NonNullable<ReturnType<typeof payTarget>>;

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
