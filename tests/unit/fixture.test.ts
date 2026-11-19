import { describe, expect, it } from "vitest";
import { CREST_COLOURS, crestColours, crestInitials, fixtureSides, meetingTime, venueLabel, withoutMeetingTime } from "@/lib/fixture";

describe("fixture poster", () => {
  it("makes a crest's letters from a club's name", () => {
    expect(crestInitials("Hvidovre IF")).toBe("HIF");
    expect(crestInitials("Brønshøj BK")).toBe("BBK");
    expect(crestInitials("B.93")).toBe("B93");
    expect(crestInitials("AB 70")).toBe("AB70");
    expect(crestInitials("Fremad Amager")).toBe("FA");
    expect(crestInitials("Skovshoved")).toBe("SKO");
    expect(crestInitials("Østerbro IF")).toBe("ØIF");
  });

  it("never gives an empty crest", () => {
    expect(crestInitials("")).toBe("?");
    expect(crestInitials("  ...  ")).toBe("?");
  });

  it("dresses a name in the same colours every time, whatever its case or spaces", () => {
    expect(crestColours("Hvidovre IF")).toBe(crestColours(" hvidovre if "));
    expect(CREST_COLOURS).toContain(crestColours("B.93"));
    const spread = new Set(["Hvidovre IF", "Brønshøj BK", "Husum BK", "Sundby BK", "Tårnby FF", "B.93"].map(crestColours));
    expect(spread.size).toBeGreaterThan(1);
  });

  it("writes the home side first, and us first when nobody knows", () => {
    expect(fixtureSides("Swingkings", "B.93", true).map((s) => s.name)).toEqual(["Swingkings", "B.93"]);
    expect(fixtureSides("Swingkings", "B.93", false).map((s) => s.name)).toEqual(["B.93", "Swingkings"]);
    expect(fixtureSides("Swingkings", "B.93", null).map((s) => s.us)).toEqual([true, false]);
  });

  it("reads the meeting time from the activity's note", () => {
    expect(meetingTime("Mødetid 13:45")).toBe("13:45");
    expect(meetingTime("Husk støvler.\nMødetid: kl. 9.30 ved klubhuset")).toBe("09:30");
    expect(meetingTime("MØDETID 11:00 – vi kører samlet")).toBe("11:00");
    expect(meetingTime("Moedetid: 18:15")).toBe("18:15");
    expect(meetingTime("Mødested: Klubhuset")).toBeNull();
    expect(meetingTime("Mødetid 25:00")).toBeNull();
    expect(meetingTime(null)).toBeNull();
  });

  it("takes the meeting time out of a note the poster already says it for", () => {
    expect(withoutMeetingTime("Mødetid 13:45")).toBeNull();
    expect(withoutMeetingTime("Mødetid 11:00 – vi kører samlet fra klubhuset")).toBe("Vi kører samlet fra klubhuset");
    expect(withoutMeetingTime("Husk støvler.\nMødetid: kl. 9.30\nTag vand med")).toBe("Husk støvler.\n\nTag vand med");
    expect(withoutMeetingTime("Ingen mødetid her")).toBe("Ingen mødetid her");
    expect(withoutMeetingTime(null)).toBeNull();
  });

  it("says home or away only when it is known", () => {
    expect(venueLabel(true)).toBe("Hjemme");
    expect(venueLabel(false)).toBe("Ude");
    expect(venueLabel(null)).toBeNull();
  });
});
