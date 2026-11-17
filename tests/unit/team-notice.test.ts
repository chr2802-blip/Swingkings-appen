import { describe, expect, it } from "vitest";
import { normalizeNoticeLink, noticeUrl } from "@/lib/team-notice";

const BOX = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";
const anna = { id: "u1", name: "Anna" };
const team = { mobilePayLink: BOX, duesKr: 600 };

describe("normalizeNoticeLink", () => {
  it("takes an https address as typed", () => {
    expect(normalizeNoticeLink(" https://swingkings.dk/kontingent ")).toBe("https://swingkings.dk/kontingent");
    expect(normalizeNoticeLink(`${BOX}?amount=60000`)).toBe(`${BOX}?amount=60000`);
  });

  it("refuses anything a notification should not open", () => {
    for (const bad of ["", "swingkings.dk", "http://swingkings.dk", "javascript:alert(1)", "https://anna:pw@swingkings.dk", "https://localhost/x", "/oversigt"]) {
      expect(normalizeNoticeLink(bad), bad).toBeNull();
    }
  });
});

describe("noticeUrl", () => {
  it("opens a page in the app, the same for everybody", () => {
    expect(noticeUrl("oversigt", { recipient: anna, team })).toBe("/oversigt");
    expect(noticeUrl("boder", { recipient: anna, team })).toBe("/boder");
    expect(noticeUrl("aktiviteter", { recipient: anna, team })).toBe("/aktiviteter");
    expect(noticeUrl("chat", { recipient: anna, team })).toBe("/chat");
  });

  it("opens each person's own page, or MobilePay with their kontingent filled in", () => {
    expect(noticeUrl("min-side", { recipient: anna, team })).toBe("/spiller/u1");
    expect(noticeUrl("mobilepay-kontingent", { recipient: anna, team })).toBe(`${BOX}?amount=60000&message=Kontingent%20%E2%80%93%20Anna`);
    expect(noticeUrl("mobilepay-kontingent", { recipient: anna, team: { mobilePayLink: BOX, duesKr: null } })).toBe(
      `${BOX}?message=Kontingent%20%E2%80%93%20Anna`,
    );
  });

  it("has nowhere to go without a box, or with a link that is not one", () => {
    expect(noticeUrl("mobilepay-kontingent", { recipient: anna, team: { mobilePayLink: null, duesKr: 600 } })).toBeNull();
    expect(noticeUrl("link", { recipient: anna, team, link: "http://example.com" })).toBeNull();
    expect(noticeUrl("link", { recipient: anna, team })).toBeNull();
    expect(noticeUrl("link", { recipient: anna, team, link: "https://example.com/x" })).toBe("https://example.com/x");
  });
});
