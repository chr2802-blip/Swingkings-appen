import { describe, expect, it } from "vitest";
import type { ReactionKind } from "@prisma/client";
import { REACTIONS, REACTORS_SHOWN, applyPress, nameList, reactionSummary, reactorsView } from "@/lib/reactions";

const row = (kind: ReactionKind, name: string) => ({ kind, userId: name, user: { name, photoId: null } });

describe("REACTIONS", () => {
  it("offers six, each once, in the order 👍 ❤️ 😂 😮 😢 🔥", () => {
    expect(REACTIONS.map((r) => r.emoji)).toEqual(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
    expect(new Set(REACTIONS.map((r) => r.kind)).size).toBe(6);
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

  it("lists each person once, first to react first, with what they gave in the order offered", () => {
    const view = reactorsView([row("FIRE", "Bo"), row("HEART", "Anna"), row("THUMBS", "Bo")]);
    expect(view.people.map((p) => [p.name, p.emojis.join("")])).toEqual([
      ["Bo", "👍🔥"],
      ["Anna", "❤️"],
    ]);
    expect(view.label).toBe("Bo og Anna har reageret");
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

  it("adds a kind nobody gave, in its place in the order", () => {
    const next = applyPress(start, "THUMBS", true);
    expect(next.map((r) => [r.emoji, r.count, r.mine])).toEqual([
      ["👍", 1, true],
      ["❤️", 1, false],
      ["🔥", 1, true],
    ]);
  });

  it("joins a kind somebody else gave, and leaves one the viewer already gave", () => {
    expect(applyPress(start, "HEART", true).find((r) => r.kind === "HEART")).toMatchObject({ count: 2, mine: true });
    expect(applyPress(start, "FIRE", true)).toBe(start);
  });

  it("takes the viewer's back: the kind goes when nobody else gave it; nothing changes for one that is not theirs", () => {
    expect(applyPress(start, "FIRE", false).map((r) => r.kind)).toEqual(["HEART"]);
    expect(applyPress(start, "HEART", false)).toBe(start);
    const both = applyPress(start, "HEART", true);
    expect(applyPress(both, "HEART", false).find((r) => r.kind === "HEART")).toMatchObject({ count: 1, mine: false });
  });
});
