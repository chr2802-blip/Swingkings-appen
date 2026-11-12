import { describe, expect, it } from "vitest";
import { generateLinkToken, hashLinkToken, joinPath, linkProblem } from "@/lib/invite-links";

describe("invitation links", () => {
  it("are long, random and stored only as a hash", () => {
    const a = generateLinkToken();
    const b = generateLinkToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashLinkToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(a)).not.toContain(a);
    expect(joinPath(a)).toBe(`/join/${a}`);
  });

  it("say why they cannot be used", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const later = new Date("2026-11-12T12:00:00Z");
    expect(linkProblem(null, now)).toBe("unknown");
    expect(linkProblem({ expiresAt: now, uses: 0, maxUses: 5 }, now)).toBe("expired");
    expect(linkProblem({ expiresAt: later, uses: 5, maxUses: 5 }, now)).toBe("used-up");
    expect(linkProblem({ expiresAt: later, uses: 4, maxUses: 5 }, now)).toBeNull();
  });
});
