import { describe, expect, it } from "vitest";
import { activeMention, insertMention, mentionSegments, mentionedIds, suggestMembers, withReplyTag } from "@/lib/mentions";

const anna = { userId: "a", name: "Anna" };
const annaH = { userId: "ah", name: "Anna Hansen" };
const bo = { userId: "b", name: "Bo" };
const team = [anna, annaH, bo];

describe("mentions", () => {
  it("finds every tagged teammate once, the longest name winning", () => {
    expect(mentionedIds("@Bo og @Anna Hansen, og @bo igen", team)).toEqual(["b", "ah"]);
    expect(mentionedIds("@Anna kommer du?", team)).toEqual(["a"]);
  });

  it("counts a name only whole, and an @ only where a tag can start", () => {
    expect(mentionedIds("@Bob @Bodil bo@Bo.dk", team)).toEqual([]);
    expect(mentionedIds("(@Bo) @Bo!", team)).toEqual(["b"]);
    expect(mentionedIds("@Kasper", team)).toEqual([]);
  });

  it("cuts the words into plain text and tagged names", () => {
    expect(mentionSegments("Godt gået @Bo og @Anna Hansen!", team)).toEqual([
      { text: "Godt gået " },
      { text: "@Bo", userId: "b" },
      { text: " og " },
      { text: "@Anna Hansen", userId: "ah" },
      { text: "!" },
    ]);
    expect(mentionSegments("Ingen tags", team)).toEqual([{ text: "Ingen tags" }]);
  });

  it("knows the tag being typed before the caret", () => {
    expect(activeMention("Hej @An", 7)).toEqual({ start: 4, query: "An" });
    expect(activeMention("Hej @Anna H", 11)).toEqual({ start: 4, query: "Anna H" });
    expect(activeMention("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMention("mail@bo", 7)).toBeNull();
    expect(activeMention("@ Bo", 4)).toBeNull();
    expect(activeMention("Hej", 3)).toBeNull();
  });

  it("suggests names beginning with the query, then words of names, never yourself", () => {
    expect(suggestMembers("an", team).map((m) => m.userId)).toEqual(["a", "ah"]);
    expect(suggestMembers("han", team).map((m) => m.userId)).toEqual(["ah"]);
    // A chosen name and its space: only longer names go on.
    expect(suggestMembers("Anna ", team).map((m) => m.userId)).toEqual(["ah"]);
    expect(suggestMembers("Bo ", team)).toEqual([]);
    expect(suggestMembers("", team, "b").map((m) => m.userId)).toEqual(["a", "ah"]);
    const many = Array.from({ length: 9 }, (_, i) => ({ userId: String(i), name: `Spiller ${i}` }));
    expect(suggestMembers("s", many)).toHaveLength(5);
  });

  it("writes the chosen name in place of what was typed", () => {
    expect(insertMention("Hej @An", 4, 7, "Anna Hansen")).toEqual({ value: "Hej @Anna Hansen ", caret: 17 });
    expect(insertMention("@B er god", 0, 2, "Bo")).toEqual({ value: "@Bo er god", caret: 4 });
  });
});

describe("withReplyTag", () => {
  it("starts an answer with its writer tagged, keeping what was typed", () => {
    expect(withReplyTag("", null, "Anna")).toBe("@Anna ");
    expect(withReplyTag("enig!", null, "Anna Berg")).toBe("@Anna Berg enig!");
  });

  it("swaps the tag when another comment is answered, and drops it when the answer is cancelled", () => {
    expect(withReplyTag("@Anna enig", "Anna", "Bo")).toBe("@Bo enig");
    expect(withReplyTag("@Anna enig", "Anna", null)).toBe("enig");
  });

  it("does not tag twice, and leaves a tag the writer has already deleted deleted", () => {
    expect(withReplyTag("@Anna enig", null, "Anna")).toBe("@Anna enig");
    expect(withReplyTag("enig", "Anna", null)).toBe("enig");
  });
});
