import { describe, expect, it } from "vitest";
import type { ReactionKind } from "@prisma/client";
import { DEFAULT_REACTION, NAMES_SHOWN, REACTIONS, nameList, pressReaction, reactorsLabel, reactorsOf, tallyReactions, type Reactor } from "@/lib/reactions";

const row = (kind: ReactionKind, name: string) => ({ kind, userId: name, user: { name, photoId: null } });

describe("REACTIONS", () => {
  it("offers the crest's crown first — what a press gives — then 👍 ❤️ 😂 😮 😢 🔥, each once", () => {
    expect(REACTIONS.map((r) => r.emoji)).toEqual(["👑", "👍", "❤️", "😂", "😮", "😢", "🔥"]);
    expect(new Set(REACTIONS.map((r) => r.kind)).size).toBe(7);
    expect(DEFAULT_REACTION).toBe("CROWN");
    expect(REACTIONS[0]).toEqual({ kind: "CROWN", emoji: "👑", label: "Krone" });
  });
});

const who = (kind: ReactionKind, name: string): Reactor => ({ id: name, name, photoId: null, kind });

describe("reactorsOf", () => {
  it("lists each person once, first to react first, with what they gave", () => {
    expect(reactorsOf([row("FIRE", "Bo"), row("CROWN", "Anna")])).toEqual([who("FIRE", "Bo"), who("CROWN", "Anna")]);
  });

  it("shows a person who still has two reactions once, with the later, in the first one's place", () => {
    expect(reactorsOf([row("FIRE", "Bo"), row("CROWN", "Anna"), row("HEART", "Bo")])).toEqual([who("HEART", "Bo"), who("CROWN", "Anna")]);
  });
});

describe("tallyReactions", () => {
  it("counts nothing when nobody has reacted", () => {
    expect(tallyReactions([], "anna")).toEqual({ total: 0, kinds: [], top: null, mine: null });
  });

  it("puts the most given first, ties in the order offered, shows the most given, and knows the viewer's", () => {
    const tally = tallyReactions(
      [who("FIRE", "Bo"), who("HEART", "Carl"), who("FIRE", "anna"), who("CROWN", "Dan"), who("HEART", "Eva"), who("SAD", "Finn")],
      "anna",
    );
    expect(tally.total).toBe(6);
    expect(tally.kinds).toEqual([
      { kind: "HEART", count: 2 },
      { kind: "FIRE", count: 2 },
      { kind: "CROWN", count: 1 },
      { kind: "SAD", count: 1 },
    ]);
    expect(tally.top).toBe("HEART");
    expect(tally.mine).toBe("FIRE");
  });
});

describe("nameList and reactorsLabel", () => {
  it("joins the last of several with og", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Anna"])).toBe("Anna");
    expect(nameList(["Anna", "Bo"])).toBe("Anna og Bo");
    expect(nameList(["Anna", "Bo", "Carl"])).toBe("Anna, Bo og Carl");
  });

  it("names the first few and counts the rest", () => {
    expect(reactorsLabel([])).toBe("");
    expect(reactorsLabel([who("CROWN", "Anna"), who("FIRE", "Bo")])).toBe("Anna og Bo har reageret");
    const many = ["A", "B", "C", "D", "E"].map((name) => who("HEART", name));
    expect(reactorsLabel(many)).toBe(`A, B, C og ${5 - NAMES_SHOWN} mere har reageret`);
  });
});

describe("pressReaction", () => {
  const start = [who("HEART", "Bo"), who("FIRE", "anna")];

  it("puts a new choice in place of the viewer's reaction, keeping their place", () => {
    expect(pressReaction(start, "anna", "CROWN", true)).toEqual([who("HEART", "Bo"), who("CROWN", "anna")]);
    expect(pressReaction(start, "anna", "FIRE", true)).toBe(start);
  });

  it("adds a viewer who had not reacted last, as Dig until the server says", () => {
    expect(pressReaction(start, "carl", "CROWN", true)).toEqual([...start, { id: "carl", name: "Dig", photoId: null, kind: "CROWN" }]);
  });

  it("takes the viewer's back, and nothing for a kind that is not theirs", () => {
    expect(pressReaction(start, "anna", "FIRE", false)).toEqual([who("HEART", "Bo")]);
    expect(pressReaction(start, "anna", "HEART", false)).toBe(start);
    expect(pressReaction(start, "carl", "HEART", false)).toBe(start);
  });
});
