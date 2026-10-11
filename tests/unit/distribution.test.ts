import { describe, expect, it } from "vitest";
import { distribute } from "@/lib/distribution";

describe("distribute", () => {
  it("gives the job to whoever has had fewest", () => {
    const picks = distribute(
      [
        { userId: "a", load: 3, lastAssignedAt: null },
        { userId: "b", load: 1, lastAssignedAt: null },
        { userId: "c", load: 2, lastAssignedAt: null },
      ],
      [{ people: 1 }],
      1,
    );
    expect(picks).toEqual([["b"]]);
  });

  it("breaks a tie by who had one longest ago", () => {
    const picks = distribute(
      [
        { userId: "a", load: 1, lastAssignedAt: new Date("2026-10-01") },
        { userId: "b", load: 1, lastAssignedAt: new Date("2026-09-01") },
      ],
      [{ people: 1 }],
      1,
    );
    expect(picks).toEqual([["b"]]);
  });

  it("spreads several jobs rather than giving them all to one person", () => {
    const people = ["a", "b", "c", "d"].map((userId) => ({ userId, load: 0, lastAssignedAt: null }));
    const picks = distribute(people, [{ people: 1 }, { people: 2 }, { people: 1 }], 42);
    const all = picks.flat();
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });

  it("never picks the same person twice for one job, and copes with too few people", () => {
    const picks = distribute([{ userId: "a", load: 0, lastAssignedAt: null }], [{ people: 3 }], 1);
    expect(picks).toEqual([["a"]]);
  });

  it("evens out over many rounds", () => {
    const people = ["a", "b", "c"].map((userId) => ({ userId, load: 0, lastAssignedAt: null }));
    const picks = distribute(people, Array.from({ length: 9 }, () => ({ people: 1 })), 7).flat();
    const counts = ["a", "b", "c"].map((id) => picks.filter((p) => p === id).length);
    expect(counts).toEqual([3, 3, 3]);
  });
});
