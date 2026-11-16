import { describe, expect, it } from "vitest";
import { externalSignupSummary, readExternalSignups, signupSummary } from "@/lib/activity";

const roster = [
  { userId: "a", name: "Anna Hansen", photoId: "p1" },
  { userId: "b", name: "Bo Berg", photoId: null },
  { userId: "c", name: "Carl Ørsted", photoId: null },
  { userId: "c2", name: "Carl Nielsen", photoId: null },
];

describe("externalSignupSummary", () => {
  it("puts KampKlar's names against the roster: in full, or a first name only one of them has", () => {
    const s = externalSignupSummary(roster, { going: ["anna hansen", "Bo", "Gæst Gæstesen"], notGoing: ["Carl Orsted"] });
    expect(s.going).toEqual([
      { key: "a", name: "Anna Hansen", userId: "a", photoId: "p1" },
      { key: "b", name: "Bo Berg", userId: "b", photoId: null },
      { key: "going-2-Gæst Gæstesen", name: "Gæst Gæstesen", userId: null, photoId: null },
    ]);
    // "Ørsted" and "Orsted" are not the same letters, so that Carl is a stranger here.
    expect(s.notGoing[0]).toMatchObject({ name: "Carl Orsted", userId: null });
    expect(s.unanswered.map((p) => p.userId)).toEqual(["c", "c2"]);
  });

  it("matches nobody by a first name two of them share, and nobody twice", () => {
    const s = externalSignupSummary(roster, { going: ["Carl", "Anna Hansen"], notGoing: ["Anna Hansen"] });
    expect(s.going.map((p) => p.userId)).toEqual([null, "a"]);
    expect(s.notGoing.map((p) => p.userId)).toEqual([null]);
  });
});

describe("readExternalSignups", () => {
  it("reads what the sync stored, and nothing else", () => {
    expect(readExternalSignups({ going: ["Anna", 3, ""], notGoing: "x" })).toEqual({ going: ["Anna"], notGoing: [] });
    expect(readExternalSignups(null)).toBeNull();
    expect(readExternalSignups("nope")).toBeNull();
  });
});

describe("signupSummary", () => {
  it("leaves out an answer from somebody no longer on the team", () => {
    const s = signupSummary(roster, [{ userId: "a", going: true }, { userId: "gone", going: false }, { userId: "b", going: false }]);
    expect(s.going.map((m) => m.userId)).toEqual(["a"]);
    expect(s.notGoing.map((m) => m.userId)).toEqual(["b"]);
    expect(s.unanswered.map((m) => m.userId)).toEqual(["c", "c2"]);
  });
});
