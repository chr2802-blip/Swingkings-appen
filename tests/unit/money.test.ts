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

  it("owes what is not reset, less what was challenged away, keeping a clean sheet on the board", () => {
    const open = null;
    const rows = balances(
      ["anna", "bo", "carl", "dan"],
      [
        { playerId: "anna", units: 2, unitPriceKr: 10, clearedAt: open },
        { playerId: "anna", units: 5, unitPriceKr: 10, clearedAt: open },
        { playerId: "anna", units: -3, unitPriceKr: 10, clearedAt: open },
        { playerId: "bo", units: 4, unitPriceKr: 20, clearedAt: new Date() },
        { playerId: "bo", units: 1, unitPriceKr: 20, clearedAt: open },
        { playerId: "gone", units: 3, unitPriceKr: 10, clearedAt: open },
        // Challenged away more than was owed at the old price: never below zero.
        { playerId: "dan", units: 1, unitPriceKr: 10, clearedAt: open },
        { playerId: "dan", units: -1, unitPriceKr: 20, clearedAt: open },
      ],
    );
    expect(rows).toEqual([
      { userId: "anna", owesKr: 40, units: 4, finedKr: 70 },
      { userId: "gone", owesKr: 30, units: 3, finedKr: 30 },
      { userId: "bo", owesKr: 20, units: 1, finedKr: 100 },
      { userId: "dan", owesKr: 0, units: 0, finedKr: 10 },
      { userId: "carl", owesKr: 0, units: 0, finedKr: 0 },
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
