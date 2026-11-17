import type { NotificationCategory } from "@prisma/client";

/**
 * What the notification center's settings offer: one switch per category, which turns
 * the push off on this team. The center shows everything whatever the switches say — so
 * nobody misses a fine because they muted it. Kept apart from `notifications.ts` so the
 * browser can import it.
 */
export const PUSH_CATEGORIES: { value: Exclude<NotificationCategory, "TEAM">; label: string; hint: string }[] = [
  { value: "FINES", label: "Bøder", hint: "Når du får en bøde, og når dine bøder er markeret betalt." },
  { value: "CHALLENGES", label: "Udfordringer", hint: "Når en udfordring venter på dig, og når den er godkendt." },
  { value: "TASKS", label: "Opgaver", hint: "Nye opgaver, og svar når du giver en opgave videre." },
  { value: "REMINDERS", label: "Påmindelser", hint: "Når en af dine opgaver snart skal være klaret." },
  { value: "ACTIVITIES", label: "Aktiviteter", hint: "Når en kamp eller træning bliver flyttet." },
  { value: "FEED", label: "Feed", hint: "Nye opslag og afstemninger." },
  { value: "COMMENTS", label: "Kommentarer", hint: "Kommentarer på dine opslag, svar til dig, og når nogen nævner dig." },
  { value: "CHAT", label: "Chat", hint: "Nye beskeder i holdets chat. De står ikke under klokken." },
];

/** What no switch turns off, said under the switches. */
export const ALWAYS_SENT =
  "Beskeder fra en admin, ny sæson, betaling af bøder og spørgsmål om at overtage en opgave får du altid.";

const MUTABLE = new Set<string>(PUSH_CATEGORIES.map((c) => c.value));

/**
 * The categories muted, from the settings form: every switch is a checkbox named `on`,
 * so what is not ticked is muted. Null when the form names a category there is none of.
 */
export function mutedFromForm(formData: FormData): NotificationCategory[] | null {
  const on = formData.getAll("on").map(String);
  if (on.some((value) => !MUTABLE.has(value))) return null;
  return PUSH_CATEGORIES.map((c) => c.value).filter((value) => !on.includes(value));
}

/** Whether a notice in `category` reaches the phone of somebody who muted `muted`. */
export function pushes(category: NotificationCategory, muted: readonly NotificationCategory[], always = false) {
  return always || category === "TEAM" || !muted.includes(category);
}

/** The bell's count: "99+" past that. */
export function bellLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

/** Whether a notification opens outside the app (MobilePay, a club's page) rather than in it. */
export function opensOutside(url: string) {
  return /^https?:\/\//i.test(url);
}
