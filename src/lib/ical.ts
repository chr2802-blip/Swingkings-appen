import { TZDate } from "@date-fns/tz";
import type { ActivityKind } from "@prisma/client";
import { TIME_ZONE } from "./time";

/**
 * Reading DBU KampKlar's calendar export.
 *
 * KampKlar (in DBU's Fodbold-app and on Mit DBU) has an "Eksporter kalender" button
 * that hands out a link to the team's activities as an iCalendar feed (RFC 5545) — the
 * same link a phone's calendar subscribes to. DBU offers no other public way in, so this
 * is the import: the team's admin pastes that link in Settings and the app reads it.
 *
 * Only what a calendar entry has to say is read — UID, SUMMARY, DTSTART, DTEND,
 * LOCATION, DESCRIPTION, STATUS, CATEGORIES — and everything else is ignored. Pure, so
 * it is tested against sample feeds without a network.
 */
export type CalendarEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  categories: string[];
  startsAt: Date;
  endsAt: Date | null;
  cancelled: boolean;
};

type Property = { name: string; params: Record<string, string>; value: string };

/** Lines continued with a leading space or tab are one line (RFC 5545 §3.1). */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Property | null {
  // The value starts at the first colon that is not inside a quoted parameter.
  let quoted = false;
  let split = -1;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const [name, ...rawParams] = line.slice(0, split).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf("=");
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name!.toUpperCase(), params, value: line.slice(split + 1) };
}

/** TEXT values escape commas, semicolons, backslashes and newlines. */
export function unescapeText(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char)).trim();
}

function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A DTSTART/DTEND: UTC (`…Z`), local with a TZID, floating (read on the team's clock),
 * or a whole day (`VALUE=DATE`, read as midnight on the team's clock).
 */
export function parseIcalDate(value: string, params: Record<string, string> = {}): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0)] as const;
  if (z) return new Date(Date.UTC(...parts));
  const zone = params.TZID && validZone(params.TZID) ? params.TZID : TIME_ZONE;
  return new Date(new TZDate(...parts, 0, zone).getTime());
}

export function parseCalendar(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: Property[] | null = null;
  // A VALARM inside an event has DESCRIPTION/SUMMARY of its own that must not win.
  let nested = 0;

  for (const line of unfold(text)) {
    if (!line.trim()) continue;
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = [];
      nested = 0;
      continue;
    }
    if (!current) continue;
    if (upper.startsWith("BEGIN:")) {
      nested++;
      continue;
    }
    if (upper.startsWith("END:") && upper !== "END:VEVENT") {
      nested = Math.max(0, nested - 1);
      continue;
    }
    if (upper === "END:VEVENT") {
      const event = toEvent(current);
      if (event) events.push(event);
      current = null;
      continue;
    }
    if (nested > 0) continue;
    const property = parseLine(line);
    if (property) current.push(property);
  }
  return events;
}

function toEvent(properties: Property[]): CalendarEvent | null {
  const get = (name: string) => properties.find((p) => p.name === name);
  const uid = get("UID")?.value.trim();
  const start = get("DTSTART");
  if (!uid || !start) return null;
  const startsAt = parseIcalDate(start.value, start.params);
  if (!startsAt) return null;
  const end = get("DTEND");
  const text = (name: string) => {
    const value = get(name)?.value;
    const clean = value === undefined ? "" : unescapeText(value);
    return clean || null;
  };
  return {
    uid,
    summary: text("SUMMARY") ?? "Aktivitet",
    description: text("DESCRIPTION"),
    location: text("LOCATION"),
    categories: properties
      .filter((p) => p.name === "CATEGORIES")
      .flatMap((p) => p.value.split(","))
      .map((c) => unescapeText(c))
      .filter(Boolean),
    startsAt,
    endsAt: end ? parseIcalDate(end.value, end.params) : null,
    cancelled: get("STATUS")?.value.trim().toUpperCase() === "CANCELLED" || /\baflyst\b/i.test(text("SUMMARY") ?? ""),
  };
}

/** Lower-case, accents and punctuation folded away, for comparing club names. */
function fold(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9æøå ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Kamp: ", "Turneringskamp - ", "Pokalkamp: " and the like in front of the teams. */
const PREFIX = /^(?:[a-zæøå]*kamp|match|træningskamp|aflyst)\s*[:\-–]\s*/i;

/**
 * What kind of activity an entry is, and for a match who it is against and whether it
 * is at home. KampKlar writes a match as "Hjemmehold - Udehold"; which side is ours is
 * read by comparing both sides against the team's own name.
 */
export function classify(
  event: Pick<CalendarEvent, "summary" | "description" | "categories">,
  teamName: string,
): { kind: ActivityKind; title: string; opponent: string | null; isHome: boolean | null } {
  const haystack = fold([event.summary, event.description ?? "", ...event.categories].join(" "));
  const title = event.summary.replace(/^aflyst\s*[:\-–]\s*/i, "").trim();
  const bare = title.replace(PREFIX, "").trim();

  const sides = bare.split(/\s+(?:-|–|vs\.?|mod)\s+/i);
  if (sides.length === 2 && sides[0] && sides[1]) {
    const ours = fold(teamName);
    const home = fold(sides[0]);
    const away = fold(sides[1]);
    const matches = (side: string) => !!ours && (side.includes(ours) || ours.includes(side));
    const weAreHome = matches(home);
    const weAreAway = matches(away);
    if (weAreHome !== weAreAway) {
      return { kind: "MATCH", title, opponent: (weAreHome ? sides[1] : sides[0]).trim(), isHome: weAreHome };
    }
    if (!/\btr(æ|ae)ning\b/.test(haystack)) return { kind: "MATCH", title, opponent: null, isHome: null };
  }

  if (/\btr(æ|ae)ning\b/.test(haystack) && !/\btr(æ|ae)ningskamp\b/.test(haystack)) {
    return { kind: "TRAINING", title, opponent: null, isHome: null };
  }
  if (/(kamp|match|turnering|pokal|stævne)/.test(haystack)) {
    return { kind: "MATCH", title, opponent: null, isHome: null };
  }
  return { kind: "OTHER", title, opponent: null, isHome: null };
}

/** A pasted calendar link, made fetchable: `webcal://` is https in a calendar's clothes. */
export function normalizeCalendarUrl(input: string): URL | null {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, "https://");
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
