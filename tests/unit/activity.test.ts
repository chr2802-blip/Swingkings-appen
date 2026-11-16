import { describe, expect, it } from "vitest";
import {
  externalSignupSummary,
  firstDaysTasks,
  readExternalSignups,
  signupSummary,
} from "@/lib/activity";

const roster = [
  { userId: "a", name: "Anna Hansen", photoId: "p1" },
  { userId: "b", name: "Bo Berg", photoId: null },
  { userId: "c", name: "Carl Ørsted", photoId: null },
  { userId: "c2", name: "Carl Nielsen", photoId: null },
];

describe("externalSignupSummary", () => {
  it("puts KampKlar's names against the roster: in full, or a first name only one of them has", () => {
    const s = externalSignupSummary(roster, {
      going: ["anna hansen", "Bo", "Gæst Gæstesen"],
      notGoing: ["Carl Orsted"],
    });
    expect(s.going).toEqual([
      { key: "a", name: "Anna Hansen", userId: "a", photoId: "p1" },
      { key: "b", name: "Bo Berg", userId: "b", photoId: null },
      {
        key: "going-2-Gæst Gæstesen",
        name: "Gæst Gæstesen",
        userId: null,
        photoId: null,
      },
    ]);
    // "Ørsted" and "Orsted" are not the same letters, so that Carl is a stranger here.
    expect(s.notGoing[0]).toMatchObject({ name: "Carl Orsted", userId: null });
    expect(s.unanswered.map((p) => p.userId)).toEqual(["c", "c2"]);
  });

  it("matches nobody by a first name two of them share, and nobody twice", () => {
    const s = externalSignupSummary(roster, {
      going: ["Carl", "Anna Hansen"],
      notGoing: ["Anna Hansen"],
    });
    expect(s.going.map((p) => p.userId)).toEqual([null, "a"]);
    expect(s.notGoing.map((p) => p.userId)).toEqual([null]);
  });
});

describe("readExternalSignups", () => {
  it("reads what the sync stored, and nothing else", () => {
    expect(
      readExternalSignups({ going: ["Anna", 3, ""], notGoing: "x" }),
    ).toEqual({ going: ["Anna"], notGoing: [] });
    expect(readExternalSignups(null)).toBeNull();
    expect(readExternalSignups("nope")).toBeNull();
  });
});

describe("signupSummary", () => {
  it("leaves out an answer from somebody no longer on the team", () => {
    const s = signupSummary(roster, [
      { userId: "a", going: true },
      { userId: "gone", going: false },
      { userId: "b", going: false },
    ]);
    expect(s.going.map((m) => m.userId)).toEqual(["a"]);
    expect(s.notGoing.map((m) => m.userId)).toEqual(["b"]);
    expect(s.unanswered.map((m) => m.userId)).toEqual(["c", "c2"]);
  });
});

describe("the next jobs", () => {
  const at = (iso: string) => new Date(iso);
  const job = (id: string, dueAt: string | null, startsAt: string | null) => ({
    id,
    dueAt: dueAt ? at(dueAt) : null,
    match: startsAt ? { startsAt: at(startsAt) } : null,
  });
  const ids = (list: { id: string }[]) => list.map((t) => t.id);

  it("shows every job on the first day one is due, by deadline or else the activity's start", () => {
    const tasks = [
      job("later", null, "2026-11-20T18:00:00Z"),
      job("evening", null, "2026-11-18T19:00:00Z"),
      job("deadline", "2026-11-18T08:00:00Z", "2026-11-25T18:00:00Z"),
      job("undated", null, null),
    ];
    expect(ids(firstDaysTasks(tasks))).toEqual(["deadline", "evening"]);
  });

  it("counts the day in Copenhagen, not in UTC", () => {
    // 23:30 UTC on the 17th is half past midnight on the 18th in Copenhagen.
    const tasks = [
      job("a", null, "2026-11-17T23:30:00Z"),
      job("b", null, "2026-11-18T12:00:00Z"),
      job("c", null, "2026-11-17T22:30:00Z"),
    ];
    expect(ids(firstDaysTasks(tasks))).toEqual(["c"]);
    expect(ids(firstDaysTasks(tasks.slice(0, 2)))).toEqual(["a", "b"]);
  });

  it("falls back to the first job when none has a day, and to nothing when there are none", () => {
    expect(
      ids(firstDaysTasks([job("x", null, null), job("y", null, null)])),
    ).toEqual(["x"]);
    expect(firstDaysTasks([])).toEqual([]);
  });
});
