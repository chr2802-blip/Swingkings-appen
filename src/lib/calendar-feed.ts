import { createHmac, timingSafeEqual } from "node:crypto";
import type { ActivityKind } from "@prisma/client";
import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { activityTitle } from "./activity";

/**
 * The team's activities as a calendar a phone subscribes to ("Tilføj til kalender").
 *
 * A calendar app fetches the feed on its own, with no session, so the address carries a
 * token: the member's id, the team's id and a signature over both and the member's
 * `tokenVersion` with `AUTH_SECRET`. Nothing is stored. The link stops working when they
 * leave the team, and when their `tokenVersion` moves (a new password, "log ud overalt").
 */

/** How far back the feed reaches: the calendar keeps last month's matches, not years of them. */
export const FEED_PAST_DAYS = 60;
/** An activity with no end is put in the calendar as this long. */
const DEFAULT_LENGTH_MS = 90 * 60_000;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function signature(userId: string, teamId: string, tokenVersion: number) {
  return createHmac("sha256", secret())
    .update(`calendar-feed|${userId}|${teamId}|${tokenVersion}`)
    .digest("base64url")
    .slice(0, 32);
}

export function calendarToken(userId: string, teamId: string, tokenVersion: number) {
  return `${userId}.${teamId}.${signature(userId, teamId, tokenVersion)}`;
}

/** Where a member's feed is served; the browser puts its own host in front. */
export function calendarPath(token: string) {
  return `/api/calendar/${token}.ics`;
}

/** A member's own feed address for a team, signed with their current `tokenVersion`. */
export async function calendarPathFor(userId: string, teamId: string) {
  const { tokenVersion } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  return calendarPath(calendarToken(userId, teamId, tokenVersion));
}

/**
 * The team a token opens, or null: a malformed token, a wrong signature, an old
 * `tokenVersion` and somebody no longer on the team all read the same.
 */
export async function teamForCalendarToken(raw: string): Promise<{ id: string; name: string } | null> {
  const token = raw.replace(/\.ics$/i, "");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[\w-]{1,64}$/.test(part))) return null;
  const [userId, teamId, given] = parts as [string, string, string];
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { user: { select: { tokenVersion: true } }, team: { select: { id: true, name: true } } },
  });
  if (!member) return null;
  const expected = Buffer.from(signature(userId, teamId, member.user.tokenVersion));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return member.team;
}

export type FeedActivity = {
  id: string;
  kind: ActivityKind;
  title: string;
  opponent: string | null;
  isHome: boolean | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  note: string | null;
  cancelledAt: Date | null;
  updatedAt: Date;
};

/** TEXT values escape backslashes, semicolons, commas and newlines (RFC 5545 §3.3.11). */
function text(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 20261116T120000Z */
function stamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 octets go on in a line starting with a space (RFC 5545 §3.1), never mid-character. */
export function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** The feed: one VEVENT per activity, a cancelled one marked so, each linking back to the app. */
export function buildCalendar(teamName: string, activities: FeedActivity[], origin: string, now: Date = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Swingkings//Aktiviteter//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(teamName)}`,
    "X-WR-TIMEZONE:Europe/Copenhagen",
    // Asks the phone to look again every few hours; it decides.
    "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
    "X-PUBLISHED-TTL:PT3H",
  ];
  for (const a of activities) {
    const url = `${origin}/aktiviteter/${a.id}`;
    const ends = a.endsAt && a.endsAt > a.startsAt ? a.endsAt : new Date(a.startsAt.getTime() + DEFAULT_LENGTH_MS);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}@swingkings`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(a.updatedAt)}`,
      `DTSTART:${stamp(a.startsAt)}`,
      `DTEND:${stamp(ends)}`,
      `SUMMARY:${text(`${a.cancelledAt ? "Aflyst: " : ""}${activityTitle(a)}`)}`,
      ...(a.location ? [`LOCATION:${text(a.location)}`] : []),
      `DESCRIPTION:${text([a.note, url].filter(Boolean).join("\n\n"))}`,
      `URL:${url}`,
      `STATUS:${a.cancelledAt ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The team's activities from `FEED_PAST_DAYS` back, for the feed. */
export async function feedActivities(teamId: string, now: Date = new Date()): Promise<FeedActivity[]> {
  return teamDb(teamId).match.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - FEED_PAST_DAYS * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      kind: true,
      title: true,
      opponent: true,
      isHome: true,
      startsAt: true,
      endsAt: true,
      location: true,
      note: true,
      cancelledAt: true,
      updatedAt: true,
    },
  });
}
