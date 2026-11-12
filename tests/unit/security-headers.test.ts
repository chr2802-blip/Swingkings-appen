import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config headers", () => {
  it("puts the security headers on every page and keeps an invitation link's token from being a referrer", async () => {
    const rules = await nextConfig.headers!();
    const all = Object.fromEntries(rules.find((r) => r.source === "/:path*")!.headers.map((h) => [h.key, h.value]));
    expect(all).toMatchObject({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });
    expect(all["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(rules.find((r) => r.source === "/join/:token")!.headers).toEqual([{ key: "Referrer-Policy", value: "no-referrer" }]);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
