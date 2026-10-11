import { describe, expect, it } from "vitest";
import { classify, normalizeCalendarUrl, parseCalendar, parseIcalDate, unescapeText } from "@/lib/ical";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//DBU//KampKlar//DA",
  "BEGIN:VEVENT",
  "UID:kamp-1@kampklar.dbu.dk",
  "DTSTART;TZID=Europe/Copenhagen:20261017T143000",
  "DTEND;TZID=Europe/Copenhagen:20261017T160000",
  "SUMMARY:Kamp: Swingkings - FC Fodboldglad",
  "LOCATION:Kunstgræsbanen\\, Vej 12\\, 2300 København S",
  "DESCRIPTION:Mødetid 13:45.\\nHusk hvide strømper",
  " og godt humør.",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Reminder that must not win",
  "TRIGGER:-PT1H",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:kamp-2@kampklar.dbu.dk",
  "DTSTART:20261024T090000Z",
  "SUMMARY:B.93 - Swingkings",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:traening-1",
  "DTSTART;VALUE=DATE:20261020",
  "SUMMARY:Træning",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:No UID, so skipped",
  "DTSTART:20261024T090000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseCalendar", () => {
  const events = parseCalendar(FEED);

  it("reads every event with a UID and a start", () => {
    expect(events.map((e) => e.uid)).toEqual(["kamp-1@kampklar.dbu.dk", "kamp-2@kampklar.dbu.dk", "traening-1"]);
  });

  it("reads a TZID time on that zone's clock (summer time, UTC+2)", () => {
    expect(events[0]!.startsAt.toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(events[0]!.endsAt?.toISOString()).toBe("2026-10-17T14:00:00.000Z");
  });

  it("unfolds continued lines and unescapes text, ignoring an alarm's own fields", () => {
    expect(events[0]!.description).toBe("Mødetid 13:45.\nHusk hvide strømperog godt humør.");
    expect(events[0]!.location).toBe("Kunstgræsbanen, Vej 12, 2300 København S");
  });

  it("reads UTC times and cancellations", () => {
    expect(events[1]!.startsAt.toISOString()).toBe("2026-10-24T09:00:00.000Z");
    expect(events[1]!.cancelled).toBe(true);
    expect(events[0]!.cancelled).toBe(false);
  });

  it("reads a whole day as midnight on the team's clock", () => {
    expect(events[2]!.startsAt.toISOString()).toBe("2026-10-19T22:00:00.000Z");
  });
});

describe("parseIcalDate", () => {
  it("reads a floating time on Copenhagen's clock, winter time", () => {
    expect(parseIcalDate("20261205T190000")?.toISOString()).toBe("2026-12-05T18:00:00.000Z");
  });
  it("refuses what is not a date", () => {
    expect(parseIcalDate("tomorrow")).toBeNull();
  });
});

describe("unescapeText", () => {
  it("unescapes backslash sequences", () => {
    expect(unescapeText("a\;b\\,c\\\\d\\Ne")).toBe("a;b,c\\d\ne");
  });
});

describe("classify", () => {
  it("finds the opponent and that we are at home", () => {
    expect(classify({ summary: "Kamp: Swingkings - FC Fodboldglad", description: null, categories: [] }, "Swingkings")).toEqual({
      kind: "MATCH",
      title: "Kamp: Swingkings - FC Fodboldglad",
      opponent: "FC Fodboldglad",
      isHome: true,
    });
  });

  it("finds that we are away, ignoring case and accents in the team name", () => {
    const result = classify({ summary: "B.93 - SWINGKINGS (Serie 4)", description: null, categories: [] }, "Swingkings");
    expect(result).toMatchObject({ kind: "MATCH", opponent: "B.93", isHome: false });
  });

  it("calls a training a training", () => {
    expect(classify({ summary: "Træning", description: null, categories: [] }, "Swingkings").kind).toBe("TRAINING");
  });

  it("calls a training match a match", () => {
    expect(classify({ summary: "Træningskamp mod Vanløse", description: null, categories: [] }, "Swingkings").kind).toBe("MATCH");
  });

  it("calls anything else an activity", () => {
    expect(classify({ summary: "Holdfest", description: null, categories: [] }, "Swingkings").kind).toBe("OTHER");
  });
});

describe("normalizeCalendarUrl", () => {
  it("turns webcal into https", () => {
    expect(normalizeCalendarUrl(" webcal://example.dk/cal.ics ")?.toString()).toBe("https://example.dk/cal.ics");
  });
  it("refuses other schemes and junk", () => {
    expect(normalizeCalendarUrl("ftp://example.dk")).toBeNull();
    expect(normalizeCalendarUrl("not a url")).toBeNull();
  });
});
