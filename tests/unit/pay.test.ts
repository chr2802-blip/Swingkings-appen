import { describe, expect, it } from "vitest";
import { afterPaying, normalizeBox, normalizeBoxLink, payLink, payTarget, paymentMessage } from "@/lib/pay";

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

const LINK = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";

describe("normalizeBoxLink", () => {
  it("takes the box's pay-in link as pasted, dropping whatever query it came with", () => {
    expect(normalizeBoxLink(LINK)).toBe(LINK);
    expect(normalizeBoxLink(` ${LINK}?amount=30 `)).toBe(LINK);
    expect(normalizeBoxLink(LINK.toUpperCase().replace("HTTPS://QR.MOBILEPAY.DK", "https://qr.mobilepay.dk").replace("/BOX/", "/box/").replace("/PAY-IN", "/pay-in"))).toBe(LINK);
  });

  it("refuses anything that is not MobilePay's own page for a box", () => {
    for (const bad of [
      "",
      "9162TV",
      LINK.replace("https:", "http:"),
      LINK.replace("qr.mobilepay.dk", "qr.mobilepay.dk.evil.example"),
      LINK.replace("qr.mobilepay.dk", "evil.example"),
      LINK.replace("/pay-in", "/somewhere-else"),
      "https://qr.mobilepay.dk/box/ikke-et-id/pay-in",
      "javascript:alert(1)",
    ]) {
      expect(normalizeBoxLink(bad), bad).toBeNull();
    }
  });
});

describe("payLink", () => {
  it("fills in the amount in øre, as MobilePay reads it", () => {
    expect(payLink(LINK, 30)).toBe(`${LINK}?amount=3000`);
    expect(payLink(LINK, 600)).toBe(`${LINK}?amount=60000`);
  });

  it("leaves the amount to the payer when there is none", () => {
    expect(payLink(LINK, null)).toBe(LINK);
    expect(payLink(LINK, 0)).toBe(LINK);
  });
});

describe("payTarget", () => {
  it("is the box, the link or both, and nothing when the team has neither", () => {
    expect(payTarget({ mobilePayBox: "9162TV", mobilePayLink: null })).toEqual({ box: "9162TV", link: null });
    expect(payTarget({ mobilePayBox: null, mobilePayLink: LINK })).toEqual({ box: null, link: LINK });
    expect(payTarget({ mobilePayBox: null, mobilePayLink: null })).toBeNull();
  });
});
