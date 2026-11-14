/**
 * Paying through the team's MobilePay Box. The box's own pay-in link
 * (https://qr.mobilepay.dk/box/<id>/pay-in) opens MobilePay on the box, and takes the
 * amount (in øre) and the message along. MobilePay Box has no API, so nobody is marked
 * paid by it: an admin ticks kontingent off, and the treasurer resets (nulstiller) the
 * fines, once they have seen the money in the box.
 */

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

export type PayKind = "fines" | "dues";

/** What the payment's message says, so whoever checks the box knows who paid for what. */
export function paymentMessage(kind: PayKind, name: string) {
  return `${kind === "fines" ? "Bøder" : "Kontingent"} – ${name}`;
}

/**
 * The pay-in link with the amount and the message filled in. MobilePay reads `amount` in
 * øre — 30 kr is `amount=3000` — and puts `message` in the payment's message field.
 * Without an amount the payer types one. Spaces are sent as %20, as MobilePay was tried with.
 */
export function payLink(link: string, amountKr: number | null, message: string) {
  const query = [
    amountKr && amountKr > 0 ? `amount=${Math.round(amountKr * 100)}` : null,
    `message=${encodeURIComponent(message)}`,
  ].filter(Boolean);
  return `${link}?${query.join("&")}`;
}

/** Who looks at the box afterwards, as the page says beside the button. */
export function afterPaying(kind: PayKind) {
  return kind === "fines"
    ? "Bødekassen nulstiller dine bøder, når betalingen er set i boxen."
    : "En admin markerer dit kontingent som betalt, når betalingen er set i boxen.";
}
