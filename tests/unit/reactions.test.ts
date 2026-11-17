import { describe, expect, it } from "vitest";
import type { ReactionKind } from "@prisma/client";
import { DEFAULT_REACTION, REACTIONS, REACTORS_SHOWN, applyPress, myReaction, nameList, reactionSummary, reactorsView } from "@/lib/reactions";

const row = (kind: ReactionKind, name: string) => ({ kind, userId: name, user: { name, photoId: null } });

describe("REACTIONS", () => {
  it("offers the crest's crown first — what a press gives — then 👍 ❤️ 😂 😮 😢 🔥, each once", () => {
    expect(REACTIONS.map((r) => r.emoji)).toEqual(["👑", "👍", "❤️", "😂", "😮", "😢", "🔥"]);
    expect(new Set(REACTIONS.map((r) => r.kind)).size).toBe(7);
    expect(DEFAULT_REACTION).toBe("CROWN");
    expect(REACTIONS[0]).toEqual({ kind: "CROWN", emoji: "👑", label: "Krone" });
  });
});

describe("reactionSummary", () => {
  it("says nothing when nobody has reacted", () => {
    expect(reactionSummary([], "anna")).toEqual([]);
  });

  it("counts each kind in the order offered, names in the order given, and marks the viewer's", () => {
    const summary = reactionSummary([row("FIRE", "Bo"), row("THUMBS", "Carl"), row("FIRE", "anna"), row("THUMBS", "Bo")], "anna");
    expect(summary).toEqual([
      { kind: "THUMBS", emoji: "👍", label: "Synes godt om", count: 2, mine: false, names: ["Carl", "Bo"] },
      { kind: "FIRE", emoji: "🔥", label: "Ild", count: 2, mine: true, names: ["Bo", "anna"] },
    ]);
  });
});

describe("nameList", () => {
  it("joins the last of several with og", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Anna"])).toBe("Anna");
    expect(nameList(["Anna", "Bo"])).toBe("Anna og Bo");
    expect(nameList(["Anna", "Bo", "Carl"])).toBe("Anna, Bo og Carl");
  });
});

describe("reactorsView", () => {
  it("shows nobody and says nothing when nobody has reacted", () => {
    expect(reactorsView([])).toEqual({ people: [], faces: [], more: 0, label: "" });
  });

  it("lists each person once, first to react first, with the reaction they gave", () => {
    const view = reactorsView([row("FIRE", "Bo"), row("CROWN", "Anna")]);
    expect(view.people.map((p) => [p.name, p.kind])).toEqual([
      ["Bo", "FIRE"],
      ["Anna", "CROWN"],
    ]);
    expect(view.label).toBe("Bo og Anna har reageret");
  });

  it("shows a person who somehow has two reactions once, with the later, in the first one's place", () => {
    const view = reactorsView([row("FIRE", "Bo"), row("CROWN", "Anna"), row("HEART", "Bo")]);
    expect(view.people.map((p) => [p.name, p.kind])).toEqual([
      ["Bo", "HEART"],
      ["Anna", "CROWN"],
    ]);
  });

  it("shows the first faces in order and counts the rest", () => {
    const many = ["A", "B", "C", "D", "E", "F", "G"].map((name) => row("HEART", name));
    const view = reactorsView(many);
    expect(view.faces.map((p) => p.name)).toEqual(["A", "B", "C", "D", "E"].slice(0, REACTORS_SHOWN));
    expect(view.more).toBe(7 - REACTORS_SHOWN);
    expect(view.label).toBe("A, B, C, D, E og 2 mere har reageret");
    expect(reactorsView(many, 2)).toMatchObject({ more: 5 });
  });
});

describe("applyPress", () => {
  const start = reactionSummary([row("HEART", "Bo"), row("FIRE", "anna")], "anna");

  it("knows the viewer's reaction", () => {
    expect(myReaction(start)).toBe("FIRE");
    expect(myReaction(reactionSummary([row("HEART", "Bo")], "anna"))).toBeNull();
  });

  it("puts a new choice in place of the viewer's reaction, in its place in the order", () => {
    const next = applyPress(start, "CROWN", true);
    expect(next.map((r) => [r.emoji, r.count, r.mine])).toEqual([
      ["👑", 1, true],
      ["❤️", 1, false],
    ]);
    expect(myReaction(next)).toBe("CROWN");
  });

  it("joins a kind somebody else gave, leaving the viewer's old one, and changes nothing for the one they have", () => {
    const next = applyPress(start, "HEART", true);
    expect(next.map((r) => [r.kind, r.count, r.mine, r.names])).toEqual([["HEART", 2, true, ["Bo", "Dig"]]]);
    expect(applyPress(start, "FIRE", true)).toBe(start);
  });

  it("takes the viewer's back; nothing changes for one that is not theirs", () => {
    expect(applyPress(start, "FIRE", false).map((r) => r.kind)).toEqual(["HEART"]);
    expect(applyPress(start, "HEART", false)).toBe(start);
    const pressed = applyPress(start, "HEART", true);
    expect(applyPress(pressed, "HEART", false)).toEqual([{ kind: "HEART", emoji: "❤️", label: "Elsker", count: 1, mine: false, names: ["Bo"] }]);
  });

  it("gives the first reaction on a thing nobody has reacted to", () => {
    expect(applyPress([], "CROWN", true)).toEqual([{ kind: "CROWN", emoji: "👑", label: "Krone", count: 1, mine: true, names: ["Dig"] }]);
  });
});
