import { describe, expect, it } from "vitest";
import { afterPaying, normalizeBox, paymentMessage } from "@/lib/pay";

describe("normalizeBox", () => {
  it("takes a box number however it is typed", () => {
    expect(normalizeBox("9162TV")).toBe("9162TV");
    expect(normalizeBox(" 9162 tv ")).toBe("9162TV");
  });

  it("refuses what cannot be a box number", () => {
    for (const bad of ["", "12", "9162-TV", "https://mobilepay.dk", "ÆØÅ123", "1234567890123"]) {
      expect(normalizeBox(bad), bad).toBeNull();
    }
  });
});

describe("paymentMessage", () => {
  it("says what was paid for and by whom", () => {
    expect(paymentMessage("fines", "Anna")).toBe("Bøder – Anna");
    expect(paymentMessage("dues", "Bo Jensen")).toBe("Kontingent – Bo Jensen");
  });
});

describe("afterPaying", () => {
  it("says who marks it afterwards: the treasurer for fines, an admin for kontingent", () => {
    expect(afterPaying("fines")).toMatch(/nulstiller/);
    expect(afterPaying("dues")).toMatch(/admin/);
  });
});
