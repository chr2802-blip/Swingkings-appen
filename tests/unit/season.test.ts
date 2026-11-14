import { describe, expect, it } from "vitest";
import { defaultSeasonName, readSummary, summarizeSeason, type SeasonRows } from "@/lib/season";

const names = new Map([
  ["anna", "Anna"],
  ["bo", "Bo"],
  ["carl", "Carl"],
  ["dorte", "Dorte"],
]);

const fine = (playerId: string, units: number, reason = "For sent", challengeId: string | null = null) => ({
  playerId,
  reason,
  units,
  unitPriceKr: 10,
  challengeId,
});

const rows = (over: Partial<SeasonRows> = {}): SeasonRows => ({
  fines: [],
  challengeWinners: [],
  tasksDone: 0,
  taskDoers: [],
  activities: 0,
  names,
  ...over,
});

describe("summarizeSeason", () => {
  it("sums an empty season to nothing, with nobody on top", () => {
    expect(summarizeSeason(rows())).toEqual({
      fines: 0,
      kr: 0,
      topFined: [],
      topReason: null,
      challenges: 0,
      topChallenger: null,
      tasks: 0,
      topWorker: null,
      activities: 0,
    });
  });

  it("counts the fines given and what they came to, a challenge moving fines without adding any", () => {
    const summary = summarizeSeason(
      rows({
        fines: [fine("anna", 2), fine("bo", 3, "Rødt kort"), fine("bo", 2, "Udfordring", "c1"), fine("anna", -2, "Udfordring", "c1")],
      }),
    );
    expect(summary.fines).toBe(2);
    expect(summary.kr).toBe(50);
    // Anna challenged her two away; Bo took them on.
    expect(summary.topFined).toEqual([{ name: "Bo", units: 5, kr: 50 }]);
  });

  it("names the top three by kroner, a tie by name, and leaves out whoever ended on nothing", () => {
    const summary = summarizeSeason(
      rows({ fines: [fine("dorte", 1), fine("carl", 3), fine("bo", 3), fine("anna", 4), fine("anna", -4, "Udfordring", "c")] }),
    );
    expect(summary.topFined.map((row) => row.name)).toEqual(["Bo", "Carl", "Dorte"]);
  });

  it("finds the fine given most often, not counting challenges", () => {
    const summary = summarizeSeason(
      rows({
        fines: [
          fine("anna", 1, "For sent"),
          fine("bo", 1, "Glemt træningstøj"),
          fine("carl", 1, "Glemt træningstøj"),
          fine("anna", 1, "Udfordring", "c1"),
          fine("bo", 1, "Udfordring", "c2"),
          fine("carl", 1, "Udfordring", "c3"),
        ],
      }),
    );
    expect(summary.topReason).toEqual({ reason: "Glemt træningstøj", count: 2 });
  });

  it("crowns the most challenges won and the most jobs done, and calls a departed player something", () => {
    const summary = summarizeSeason(
      rows({
        challengeWinners: ["bo", "anna", "bo"],
        tasksDone: 3,
        taskDoers: ["gone", "gone", "anna", "carl"],
        activities: 12,
      }),
    );
    expect(summary.challenges).toBe(3);
    expect(summary.topChallenger).toEqual({ name: "Bo", wins: 2 });
    expect(summary.tasks).toBe(3);
    expect(summary.topWorker).toEqual({ name: "Tidligere spiller", tasks: 2 });
    expect(summary.activities).toBe(12);
  });
});

describe("defaultSeasonName", () => {
  it("is the year for a season within one, and both years across New Year", () => {
    expect(defaultSeasonName(new Date("2026-02-01T12:00:00Z"), new Date("2026-11-14T12:00:00Z"))).toBe("Sæson 2026");
    expect(defaultSeasonName(new Date("2025-08-01T12:00:00Z"), new Date("2026-06-20T12:00:00Z"))).toBe("Sæson 2025/26");
  });

  it("reads the year on the team's clock", () => {
    // 23:30 UTC on New Year's Eve is already the new year in Copenhagen.
    expect(defaultSeasonName(new Date("2025-12-31T23:30:00Z"), new Date("2026-06-01T12:00:00Z"))).toBe("Sæson 2026");
  });
});

describe("readSummary", () => {
  it("fills in what an older summary lacks", () => {
    expect(readSummary({ fines: 4, kr: 40 })).toMatchObject({ fines: 4, kr: 40, topFined: [], topWorker: null, activities: 0 });
    expect(readSummary(null).fines).toBe(0);
  });
});
