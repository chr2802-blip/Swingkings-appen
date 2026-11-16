import { describe, expect, it } from "vitest";
import { classify, dbuLink, kampKlarDetails, normalizeCalendarUrl, parseCalendar, parseIcalDate, unescapeText } from "@/lib/ical";

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

describe("kampKlarDetails", () => {
  // As KampKlar writes it: one label to a line, the description's own text under "Beskrivelse:".
  const KAMPKLAR = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:7334167@dbu",
    "DTSTART:20261116T110000Z",
    "SUMMARY:Test overskrift",
    "DESCRIPTION:Mødested: Læssøgadeskolen\\n\\nBeskrivelse:\\nTest beskrivelse\\n\\nAktivitetslink: https://web.dbu.dk/fodboldapp?page=HOActivity&activityId=7334167",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads the link, the meeting place and the description from KampKlar's labels", () => {
    const [event] = parseCalendar(KAMPKLAR);
    expect(kampKlarDetails(event!)).toEqual({
      link: "https://web.dbu.dk/fodboldapp?page=HOActivity&activityId=7334167",
      meetingPlace: "Læssøgadeskolen",
      note: "Test beskrivelse",
      signups: null,
    });
  });

  it("reads sign-ups from Tilmeldte and Afbud, one to a line or separated by commas", () => {
    const details = kampKlarDetails({
      description: "Tilmeldte (3):\n- Anna Hansen\n- Bo Berg\n• Carl\n\nAfbud: Dorte, Eva\n\nBeskrivelse:\nHusk bolde",
      url: null,
      attendees: [],
    });
    expect(details.signups).toEqual({ going: ["Anna Hansen", "Bo Berg", "Carl"], notGoing: ["Dorte", "Eva"] });
    expect(details.note).toBe("Husk bolde");
  });

  it("ends a list of names at a label it does not know, which goes in the note", () => {
    const details = kampKlarDetails({ description: "Tilmeldte: Anna\nBo\nTil rådighed: Carl\nMødetid: 13:45", url: null });
    expect(details.signups).toEqual({ going: ["Anna", "Bo"], notGoing: [] });
    expect(details.note).toBe("Til rådighed: Carl\nMødetid: 13:45");
  });

  it("reads sign-ups from ATTENDEE lines when the description has none", () => {
    const [event] = parseCalendar(
      [
        "BEGIN:VEVENT",
        "UID:x",
        "DTSTART:20261116T110000Z",
        'ATTENDEE;CN="Anna Hansen";PARTSTAT=ACCEPTED:mailto:a@example.com',
        "ATTENDEE;CN=Bo;PARTSTAT=DECLINED:mailto:b@example.com",
        "ATTENDEE;CN=Carl;PARTSTAT=NEEDS-ACTION:mailto:c@example.com",
        "URL:https://web.dbu.dk/fodboldapp?activityId=1",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(kampKlarDetails(event!)).toMatchObject({
      link: "https://web.dbu.dk/fodboldapp?activityId=1",
      signups: { going: ["Anna Hansen"], notGoing: ["Bo"] },
    });
  });

  it("keeps a description with no labels as it is, and other labels in the note", () => {
    expect(kampKlarDetails({ description: "Husk hvide strømper", url: null }).note).toBe("Husk hvide strømper");
    expect(kampKlarDetails({ description: "Mødetid: 13:45\nBeskrivelse:\nGodt humør", url: null }).note).toBe("Mødetid: 13:45\n\nGodt humør");
    expect(kampKlarDetails({ description: null }).note).toBeNull();
  });

  it("makes a button only of an https link to DBU", () => {
    expect(dbuLink("https://web.dbu.dk/x")).toBe("https://web.dbu.dk/x");
    expect(dbuLink("https://dbu.dk/x")).toBe("https://dbu.dk/x");
    expect(dbuLink("http://web.dbu.dk/x")).toBeNull();
    expect(dbuLink("https://dbu.dk.evil.example/x")).toBeNull();
    expect(dbuLink("javascript:alert(1)")).toBeNull();
    expect(kampKlarDetails({ description: "Aktivitetslink: https://evil.example/x", url: null }).link).toBeNull();
  });
});
