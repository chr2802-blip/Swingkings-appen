import { describe, expect, it } from "vitest";
import { afterPaying, normalizeBoxLink, payLink, paymentMessage } from "@/lib/pay";

const LINK = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";

describe("normalizeBoxLink", () => {
  it("takes the box's pay-in link as pasted, dropping whatever query it came with", () => {
    expect(normalizeBoxLink(LINK)).toBe(LINK);
    expect(normalizeBoxLink(` ${LINK}?amount=3000&message=Test%20besked `)).toBe(LINK);
    expect(normalizeBoxLink(LINK.replace("b865a6da", "B865A6DA"))).toBe(LINK);
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

describe("paymentMessage", () => {
  it("says what was paid for and by whom", () => {
    expect(paymentMessage("fines", "Anna")).toBe("Bøder – Anna");
    expect(paymentMessage("dues", "Bo Jensen")).toBe("Kontingent – Bo Jensen");
  });
});

describe("payLink", () => {
  it("fills in the amount in øre and the message, spaces as %20 — the way MobilePay was tried", () => {
    expect(payLink(LINK, 30, "Test besked")).toBe(`${LINK}?amount=3000&message=Test%20besked`);
    expect(payLink(LINK, 600, paymentMessage("dues", "Bo"))).toBe(`${LINK}?amount=60000&message=Kontingent%20%E2%80%93%20Bo`);
  });

  it("leaves the amount to the payer when there is none, and still sends the message", () => {
    expect(payLink(LINK, null, "Kontingent – Bo")).toBe(`${LINK}?message=Kontingent%20%E2%80%93%20Bo`);
    expect(payLink(LINK, 0, "x")).toBe(`${LINK}?message=x`);
  });

  it("keeps a name with & or ? inside the message", () => {
    const url = new URL(payLink(LINK, 10, "Bøder – Anna & Bo?"));
    expect(url.searchParams.get("message")).toBe("Bøder – Anna & Bo?");
    expect(url.searchParams.get("amount")).toBe("1000");
  });
});

describe("afterPaying", () => {
  it("says who marks it afterwards: the treasurer for fines, an admin for kontingent", () => {
    expect(afterPaying("fines")).toMatch(/nulstiller/);
    expect(afterPaying("dues")).toMatch(/admin/);
  });
});
