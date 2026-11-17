import { describe, expect, it } from "vitest";
import { matchesSearch, searchChoices, searchKey } from "@/lib/search";

describe("searchKey", () => {
  it("drops case, accents and extra spaces", () => {
    expect(searchKey("  Café   ÅGE ")).toBe("cafe age");
  });

  it("keeps æ and ø, which are letters of their own", () => {
    expect(searchKey("Ærø")).toBe("ærø");
  });
});

describe("matchesSearch", () => {
  it("answers everything when nothing is typed", () => {
    expect(matchesSearch("For sent", "")).toBe(true);
    expect(matchesSearch("For sent", "   ")).toBe(true);
  });

  it("finds every word, in any order, anywhere in the label", () => {
    expect(matchesSearch("Ude: FC Naboen", "naboen ude")).toBe(true);
    expect(matchesSearch("Ude: FC Naboen", "nab")).toBe(true);
  });

  it("refuses a label missing one of the words", () => {
    expect(matchesSearch("Ude: FC Naboen", "naboen hjemme")).toBe(false);
    expect(matchesSearch("For sent", "glemt")).toBe(false);
  });

  it("ignores case and accents on both sides", () => {
    expect(matchesSearch("Glemte benskinner", "BENSKIN")).toBe(true);
    expect(matchesSearch("Café", "cafe")).toBe(true);
    expect(matchesSearch("Cafe", "café")).toBe(true);
  });
});

describe("searchChoices", () => {
  it("keeps the matching choices in their own order", () => {
    const choices = [{ label: "For sent" }, { label: "Glemt tøj" }, { label: "For sent til kamp" }];
    expect(searchChoices(choices, "sent").map((c) => c.label)).toEqual(["For sent", "For sent til kamp"]);
    expect(searchChoices(choices, "")).toHaveLength(3);
  });
});
