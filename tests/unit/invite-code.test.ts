import { describe, expect, it } from "vitest";
import { generateInviteCode, hashInviteCode, inviteCodeMatches, normalizeInviteCode } from "@/lib/invite-code";

describe("invite codes", () => {
  it("are eight unambiguous characters in two groups", () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("differ from one another", () => {
    expect(new Set(Array.from({ length: 100 }, generateInviteCode)).size).toBe(100);
  });

  it("match however they are typed back, and nothing else", () => {
    const code = "K7P2-QW4M";
    const hash = hashInviteCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("K7P2");
    for (const typed of ["K7P2-QW4M", "k7p2qw4m", " k7p2 qw4m ", "K7P2_QW4M"]) expect(inviteCodeMatches(typed, hash)).toBe(true);
    expect(inviteCodeMatches("K7P2-QW4N", hash)).toBe(false);
    expect(inviteCodeMatches("K7P2-QW4M", "kort")).toBe(false);
    expect(normalizeInviteCode("ab-12 ø")).toBe("AB12");
  });
});
