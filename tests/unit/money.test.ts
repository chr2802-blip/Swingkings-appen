import { describe, expect, it } from "vitest";
import { balances, fineKings, fineUnits, kr } from "@/lib/money";

describe("money", () => {
  it("writes kroner the Danish way", () => {
    expect(kr(1250).replace(/\s/g, " ")).toBe("1.250 kr");
    expect(kr(0)).toBe("0 kr");
  });

  it("counts fines", () => {
    expect(fineUnits(1)).toBe("1 bøde");
    expect(fineUnits(3)).toBe("3 bøder");
  });

  it("owes every fine of the season, less what was challenged away, keeping a clean sheet on the board", () => {
    const rows = balances(
      ["anna", "bo", "carl", "dan"],
      [
        { playerId: "anna", units: 2, unitPriceKr: 10 },
        { playerId: "anna", units: 5, unitPriceKr: 10 },
        { playerId: "anna", units: -3, unitPriceKr: 10 },
        // Each fine at the price it was given.
        { playerId: "bo", units: 4, unitPriceKr: 20 },
        { playerId: "bo", units: 1, unitPriceKr: 20 },
        { playerId: "gone", units: 3, unitPriceKr: 10 },
        // Challenged away more than was owed at the old price: never below zero.
        { playerId: "dan", units: 1, unitPriceKr: 10 },
        { playerId: "dan", units: -1, unitPriceKr: 20 },
      ],
    );
    expect(rows).toEqual([
      { userId: "bo", owesKr: 100, units: 5 },
      { userId: "anna", owesKr: 40, units: 4 },
      { userId: "gone", owesKr: 30, units: 3 },
      { userId: "carl", owesKr: 0, units: 0 },
      { userId: "dan", owesKr: 0, units: 0 },
    ]);
  });

  it("crowns whoever was fined most, at the price each fine was given", () => {
    expect(fineKings([])).toEqual({ userIds: [], kr: 0 });
    expect(
      fineKings([
        { playerId: "anna", units: 1, unitPriceKr: 10 },
        { playerId: "bo", units: 1, unitPriceKr: 25 },
        { playerId: "anna", units: 1, unitPriceKr: 10 },
      ]),
    ).toEqual({ userIds: ["bo"], kr: 25 });
  });

  it("does not take a won challenge off the crown", () => {
    expect(
      fineKings([
        { playerId: "anna", units: 3, unitPriceKr: 10 },
        { playerId: "anna", units: -3, unitPriceKr: 10 },
        { playerId: "bo", units: 2, unitPriceKr: 10 },
      ]),
    ).toEqual({ userIds: ["anna"], kr: 30 });
  });

  it("lets a tie share the crown", () => {
    expect(
      fineKings([
        { playerId: "carl", units: 2, unitPriceKr: 10 },
        { playerId: "anna", units: 4, unitPriceKr: 5 },
      ]),
    ).toEqual({ userIds: ["anna", "carl"], kr: 20 });
  });
});
