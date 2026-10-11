import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";
import { da } from "date-fns/locale";

/**
 * The team's clock. Every date is decided and shown here, never in the server's own
 * zone — that is UTC on Vercel and something else on a laptop. Never `new Date(...)`
 * arithmetic or `getHours()` for anything a person sees.
 */
export const TIME_ZONE = "Europe/Copenhagen";

export function inZone(date: Date) {
  return new TZDate(date, TIME_ZONE);
}

/** Today in the team's zone, as the "yyyy-MM-dd" a date input expects. */
export function todayInZone(now: Date = new Date()) {
  return format(inZone(now), "yyyy-MM-dd");
}

/** Machine-only formatting (a date input's value), no locale. */
export function formatInZone(date: Date, pattern: string) {
  return format(inZone(date), pattern);
}

/** An instant as a person reads it, in Danish, on the team's clock. */
export function readInZone(date: Date, pattern: string) {
  return format(inZone(date), pattern, { locale: da });
}

function parseDay(input: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function exact(year: number, month: number, day: number, hour: number, minute: number, second = 0, ms = 0) {
  const zoned = new TZDate(year, month - 1, day, hour, minute, second, ms, TIME_ZONE);
  // Rejects impossible dates such as 2026-02-31, which would otherwise roll over.
  if (zoned.getFullYear() !== year || zoned.getMonth() !== month - 1 || zoned.getDate() !== day) return null;
  return new Date(zoned.getTime());
}

/**
 * A deadline given as a day: the last moment of that day in the team's zone, so a task
 * due "on Friday" is overdue from Saturday morning and not from Friday breakfast.
 */
export function deadlineOn(dateInput: string): Date | null {
  const day = parseDay(dateInput);
  return day ? exact(day[0], day[1], day[2], 23, 59, 59, 999) : null;
}

/** A "yyyy-MM-ddTHH:mm" from a datetime-local input, read on the team's clock. */
export function parseLocalDateTime(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(input.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [unknown, number, number, number, number, number];
  if (h > 23 || mi > 59) return null;
  return exact(y, mo, d, h, mi);
}

/** The value a datetime-local input shows for an instant. */
export function toLocalDateTimeInput(date: Date) {
  return formatInZone(date, "yyyy-MM-dd'T'HH:mm");
}

/** The last instant of the day `now` falls in, on the team's clock. */
export function endOfDayInZone(now: Date = new Date()): Date {
  const z = inZone(now);
  return exact(z.getFullYear(), z.getMonth() + 1, z.getDate(), 23, 59, 59, 999)!;
}

/** The first instant of the day `now` falls in, on the team's clock. */
export function startOfDayInZone(now: Date = new Date()): Date {
  const z = inZone(now);
  return exact(z.getFullYear(), z.getMonth() + 1, z.getDate(), 0, 0)!;
}

/** Whole calendar days from `from` to `target`, counted on the team's clock. */
export function calendarDaysBetween(target: Date, from: Date) {
  return differenceInCalendarDays(inZone(target), inZone(from));
}

/** "i dag", "i morgen", "om 3 dage", "i går", "for 2 dage siden" — or the date itself. */
export function relativeDay(target: Date, now: Date = new Date()) {
  const days = calendarDaysBetween(target, now);
  if (days === 0) return "i dag";
  if (days === 1) return "i morgen";
  if (days === -1) return "i går";
  if (days > 1 && days < 7) return `om ${days} dage`;
  if (days < 0 && days > -7) return `for ${-days} dage siden`;
  return readInZone(target, "d. MMM");
}

/** A deadline as a person reads it, with whether it has passed. */
export function deadlineLabel(dueAt: Date, now: Date = new Date()) {
  const days = calendarDaysBetween(dueAt, now);
  if (days < 0) return { text: `Overskredet (${readInZone(dueAt, "d. MMM")})`, overdue: true };
  if (days === 0) return { text: "Frist i dag", overdue: false };
  if (days === 1) return { text: "Frist i morgen", overdue: false };
  return { text: `Frist ${readInZone(dueAt, "EEE d. MMM")}`, overdue: false };
}

/** "lør. 12. okt. kl. 14:30" */
export function kickoffLabel(date: Date) {
  return readInZone(date, "EEE d. MMM 'kl.' HH:mm");
}

/** A chat or feed timestamp: the time today, otherwise the day and the time. */
export function stampLabel(date: Date, now: Date = new Date()) {
  const days = calendarDaysBetween(date, now);
  if (days === 0) return readInZone(date, "HH:mm");
  if (days === -1) return `i går ${readInZone(date, "HH:mm")}`;
  return readInZone(date, "d. MMM HH:mm");
}
