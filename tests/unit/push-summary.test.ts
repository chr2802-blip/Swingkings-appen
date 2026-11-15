import { describe, expect, it } from "vitest";
import { ACTIVE_MS, chatSummary, chatText, commentSummary, isActive, latest, whoText } from "@/lib/push-summary";

describe("whoText", () => {
  it("names up to three, then counts the rest, without repeating anybody", () => {
    expect(whoText([])).toBe("");
    expect(whoText(["Anna"])).toBe("Anna");
    expect(whoText(["Anna", "Anna", "Bo"])).toBe("Anna og Bo");
    expect(whoText(["Anna", "Bo", "Carl"])).toBe("Anna, Bo og Carl");
    expect(whoText(["Anna", "Bo", "Carl", "Dan", "Eva", "Bo"])).toBe("Anna, Bo og 3 andre");
  });
});

describe("chatSummary", () => {
  it("shows one message as itself", () => {
    expect(chatSummary("Swingkings", [{ authorName: "Anna", text: "Hej" }])).toEqual({ title: "Anna · Swingkings", body: "Hej" });
  });

  it("counts several, names who wrote them newest first, and quotes the latest", () => {
    const unread = ["Anna", "Bo", "Anna", "Carl"].map((authorName, i) => ({ authorName, text: `besked ${i}` }));
    expect(chatSummary("Swingkings", unread)).toEqual({
      title: "Swingkings · 4 nye beskeder",
      body: "Carl, Anna og Bo\nCarl: besked 3",
    });
  });

  it("stops counting at 99 and shortens a long message", () => {
    const unread = Array.from({ length: 100 }, () => ({ authorName: "Anna", text: "x".repeat(300) }));
    const summary = chatSummary("Swingkings", unread);
    expect(summary.title).toBe("Swingkings · 99+ nye beskeder");
    expect(summary.body).toBe(`Anna\nAnna: ${"x".repeat(139)}…`);
  });
});

describe("commentSummary", () => {
  it("shows one comment as itself and several as a count", () => {
    expect(commentSummary([{ authorName: "Bo", text: "Flot!" }])).toEqual({ title: "Bo kommenterede dit opslag", body: "Flot!" });
    expect(commentSummary([{ authorName: "Bo", text: "Flot!" }, { authorName: "Anna", text: "Enig" }])).toEqual({
      title: "2 nye kommentarer på dit opslag",
      body: "Anna og Bo\nAnna: Enig",
    });
  });
});

describe("isActive and latest", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  it("counts somebody as there for a minute after they were last seen", () => {
    expect(isActive(null, now)).toBe(false);
    expect(isActive(new Date(now.getTime() - ACTIVE_MS + 1000), now)).toBe(true);
    expect(isActive(new Date(now.getTime() - ACTIVE_MS), now)).toBe(false);
  });

  it("takes the latest of whatever moments there are", () => {
    expect(latest(null, new Date(5), undefined, new Date(3))).toEqual(new Date(5));
    expect(latest(null)).toEqual(new Date(0));
  });
});

describe("chatText", () => {
  it("stands in for a message that is only pictures", () => {
    expect(chatText("Hej", 2)).toBe("Hej");
    expect(chatText("", 1)).toBe("📷 Sendte et billede");
    expect(chatText("", 3)).toBe("📷 Sendte 3 billeder");
  });
});
