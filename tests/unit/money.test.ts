import { describe, expect, it } from "vitest";
import { balances, fineUnits, kr } from "@/lib/money";

describe("money", () => {
  it("writes kroner the Danish way", () => {
    expect(kr(1250).replace(/\s/g, " ")).toBe("1.250 kr");
    expect(kr(0)).toBe("0 kr");
  });

  it("counts fines", () => {
    expect(fineUnits(1)).toBe("1 bøde");
    expect(fineUnits(3)).toBe("3 bøder");
  });

  it("balances fines against payments, keeping a clean sheet on the board", () => {
    const rows = balances(
      ["anna", "bo", "carl"],
      [
        { playerId: "anna", units: 2, unitPriceKr: 10 },
        { playerId: "anna", units: 5, unitPriceKr: 10 },
        { playerId: "bo", units: 1, unitPriceKr: 20 },
        { playerId: "gone", units: 3, unitPriceKr: 10 },
      ],
      [
        { playerId: "anna", amountKr: 50 },
        { playerId: "bo", amountKr: 40 },
      ],
    );
    expect(rows).toEqual([
      { userId: "gone", finedKr: 30, paidKr: 0, owesKr: 30, fines: 1 },
      { userId: "anna", finedKr: 70, paidKr: 50, owesKr: 20, fines: 2 },
      { userId: "carl", finedKr: 0, paidKr: 0, owesKr: 0, fines: 0 },
      { userId: "bo", finedKr: 20, paidKr: 40, owesKr: -20, fines: 1 },
    ]);
  });
});
