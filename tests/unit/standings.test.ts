import { describe, expect, it } from "vitest";
import { places, standings } from "@/lib/standings";

describe("fine standings", () => {
  it("places by what is owed, and equal sums share the higher place", () => {
    const placed = places([
      { userId: "a", owesKr: 50 },
      { userId: "b", owesKr: 120 },
      { userId: "c", owesKr: 50 },
      { userId: "d", owesKr: 0 },
    ]);
    expect(Object.fromEntries(placed)).toEqual({ b: 1, a: 2, c: 2, d: 4 });
  });

  it("everybody on a clean sheet shares first place", () => {
    expect([...places([{ userId: "a", owesKr: 0 }, { userId: "b", owesKr: 0 }]).values()]).toEqual([1, 1]);
  });

  it("says how far each has moved since a week ago, up the table being positive", () => {
    const now = [
      { userId: "a", owesKr: 200 },
      { userId: "b", owesKr: 150 },
      { userId: "c", owesKr: 100 },
      { userId: "new", owesKr: 10 },
    ];
    const weekAgo = [
      { userId: "b", owesKr: 150 },
      { userId: "c", owesKr: 100 },
      { userId: "a", owesKr: 50 },
    ];
    const rows = standings(now, weekAgo);
    expect(rows.map((r) => [r.userId, r.place, r.move])).toEqual([
      ["a", 1, 2],
      ["b", 2, -1],
      ["c", 3, -1],
      ["new", 4, null],
    ]);
  });

  it("keeps the rows it was given, in their order", () => {
    const rows = standings([{ userId: "x", owesKr: 5, units: 1 }], [{ userId: "x", owesKr: 5 }]);
    expect(rows).toEqual([{ userId: "x", owesKr: 5, units: 1, place: 1, move: 0 }]);
  });
});
