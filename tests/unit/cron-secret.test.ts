import { afterEach, describe, expect, it } from "vitest";
import { presentsCronSecret } from "@/lib/cron-secret";

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} });

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("presentsCronSecret", () => {
  it("admits the configured bearer token and nothing else", () => {
    process.env.CRON_SECRET = "hemmelig";
    expect(presentsCronSecret(request("Bearer hemmelig"))).toBe(true);
    expect(presentsCronSecret(request("Bearer hemmeli"))).toBe(false);
    expect(presentsCronSecret(request("Bearer hemmeligX"))).toBe(false);
    expect(presentsCronSecret(request("hemmelig"))).toBe(false);
    expect(presentsCronSecret(request())).toBe(false);
  });

  it("admits nobody when no secret is configured, an empty token included", () => {
    expect(presentsCronSecret(request("Bearer "))).toBe(false);
    expect(presentsCronSecret(request("Bearer undefined"))).toBe(false);
  });
});
