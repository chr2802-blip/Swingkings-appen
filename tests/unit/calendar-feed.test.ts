import { beforeAll, describe, expect, it } from "vitest";
import { buildCalendar, calendarPath, calendarToken, fold, type FeedActivity } from "@/lib/calendar-feed";
import { activityTitle } from "@/lib/activity";
import { parseCalendar } from "@/lib/ical";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "unit-test-secret";
});

const activity = (extra: Partial<FeedActivity> = {}): FeedActivity => ({
  id: "m1",
  kind: "MATCH",
  title: "Swingkings - AB",
  opponent: "AB",
  isHome: true,
  startsAt: new Date("2026-11-20T18:00:00Z"),
  endsAt: null,
  location: "Bane 3, Vej 12",
  note: "Husk; hvide strømper",
  cancelledAt: null,
  updatedAt: new Date("2026-11-16T10:00:00Z"),
  ...extra,
});

describe("buildCalendar", () => {
  const now = new Date("2026-11-16T12:00:00Z");

  it("writes each activity as an event our own reader reads back the same", () => {
    const ics = buildCalendar("Swingkings", [activity(), activity({ id: "m2", kind: "OTHER", title: "Julefrokost", opponent: null, isHome: null, endsAt: new Date("2026-11-21T23:00:00Z"), startsAt: new Date("2026-11-21T18:00:00Z"), location: null, note: null })], "https://app.example", now);
    expect(ics).toContain("X-WR-CALNAME:Swingkings\r\n");
    const [match, party] = parseCalendar(ics);
    expect(match).toMatchObject({
      uid: "m1@swingkings",
      summary: "Hjemme mod AB",
      location: "Bane 3, Vej 12",
      cancelled: false,
      url: "https://app.example/aktiviteter/m1",
    });
    expect(match!.description).toBe("Husk; hvide strømper\n\nhttps://app.example/aktiviteter/m1");
    // No end: an hour and a half.
    expect(match!.endsAt?.toISOString()).toBe("2026-11-20T19:30:00.000Z");
    expect(party).toMatchObject({ summary: "Julefrokost", location: null, description: "https://app.example/aktiviteter/m2" });
    expect(party!.endsAt?.toISOString()).toBe("2026-11-21T23:00:00.000Z");
  });

  it("marks a cancelled activity cancelled, in its status and its name", () => {
    const [event] = parseCalendar(buildCalendar("Swingkings", [activity({ cancelledAt: now })], "https://app.example", now));
    expect(event).toMatchObject({ cancelled: true, summary: "Aflyst: Hjemme mod AB" });
  });

  it("is a calendar with no events when there are no activities", () => {
    const ics = buildCalendar("Swingkings", [], "https://app.example", now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(parseCalendar(ics)).toEqual([]);
  });
});

describe("fold", () => {
  it("keeps lines within 75 octets without splitting a character", () => {
    const line = `DESCRIPTION:${"æøå".repeat(40)}`;
    const folded = fold(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.map((part, i) => (i === 0 ? part : part.slice(1))).join("")).toBe(line);
    expect(fold("SHORT:x")).toBe("SHORT:x");
  });
});

describe("calendarToken", () => {
  it("is bound to the member, the team and the token version", () => {
    const token = calendarToken("u1", "t1", 0);
    expect(token).toMatch(/^u1\.t1\.[\w-]{32}$/);
    expect(calendarToken("u1", "t1", 0)).toBe(token);
    expect(calendarToken("u1", "t1", 1)).not.toBe(token);
    expect(calendarToken("u1", "t2", 0)).not.toBe(token);
    expect(calendarToken("u2", "t1", 0)).not.toBe(token);
    expect(calendarPath(token)).toBe(`/api/calendar/${token}.ics`);
  });
});

describe("activityTitle", () => {
  it("names a match by the side and the opponent, and anything else by its title", () => {
    const base = { kind: "MATCH" as const, title: "Swingkings - AB", opponent: "AB" };
    expect(activityTitle({ ...base, isHome: true })).toBe("Hjemme mod AB");
    expect(activityTitle({ ...base, isHome: false })).toBe("Ude mod AB");
    expect(activityTitle({ ...base, isHome: null })).toBe("Mod AB");
    expect(activityTitle({ ...base, opponent: null, isHome: null })).toBe("Swingkings - AB");
    expect(activityTitle({ kind: "TRAINING", title: "Træning", opponent: null, isHome: null })).toBe("Træning");
  });
});
