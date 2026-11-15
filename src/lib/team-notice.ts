import { payLink, paymentMessage } from "./pay";

/**
 * A notification an admin writes and sends from the team settings ("Husk kontingent"):
 * to one person or to everybody, opening a page in the app or a link outside it.
 *
 * Where it lands is picked from a short list rather than typed as a path, so a push
 * never sends anybody to a page that does not exist. Two of them differ per person: their
 * own player page (where kontingent is shown and paid) and MobilePay with the amount and
 * "Kontingent – <navn>" filled in.
 */
export const NOTICE_DESTINATIONS = [
  { value: "oversigt", label: "Oversigten" },
  { value: "boder", label: "Bødekassen" },
  { value: "aktiviteter", label: "Aktiviteter" },
  { value: "chat", label: "Chatten" },
  { value: "min-side", label: "Personens egen side (kontingent)" },
  { value: "mobilepay-kontingent", label: "MobilePay: betal kontingent" },
  { value: "link", label: "Et andet link…" },
] as const;

export type NoticeDestination = (typeof NOTICE_DESTINATIONS)[number]["value"];

const IN_APP: Partial<Record<NoticeDestination, string>> = {
  oversigt: "/oversigt",
  boder: "/boder",
  aktiviteter: "/aktiviteter",
  chat: "/chat",
};

export const MAX_NOTICE_TITLE = 60;
export const MAX_NOTICE_BODY = 200;

/**
 * A link typed by the admin, or null when it is not one a notification may open: https
 * only (no `javascript:`, no plain http), and no name and password in it.
 */
export function normalizeNoticeLink(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
  return url.href;
}

/** Whether the destination differs per person, so each gets a push of their own. */
export function isPersonal(destination: NoticeDestination) {
  return destination === "min-side" || destination === "mobilepay-kontingent";
}

/**
 * Where the notification opens for one person, or null when the destination cannot be
 * reached (MobilePay without a box, a link that is not one).
 */
export function noticeUrl(
  destination: NoticeDestination,
  context: {
    recipient: { id: string; name: string };
    team: { mobilePayLink: string | null; duesKr: number | null };
    link?: string | null;
  },
): string | null {
  const inApp = IN_APP[destination];
  if (inApp) return inApp;
  switch (destination) {
    case "min-side":
      return `/spiller/${context.recipient.id}`;
    case "mobilepay-kontingent":
      return context.team.mobilePayLink
        ? payLink(context.team.mobilePayLink, context.team.duesKr, paymentMessage("dues", context.recipient.name))
        : null;
    case "link":
      return context.link ? normalizeNoticeLink(context.link) : null;
    default:
      return null;
  }
}
