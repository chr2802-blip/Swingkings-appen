import { describe, expect, it } from "vitest";
import { scrubUrl } from "@/lib/analytics-url";

describe("scrubUrl", () => {
  it("keeps an invitation token out of what analytics hears", () => {
    expect(scrubUrl("https://swingkings.dk/join/abc_DEF-123?x=1#y")).toBe("https://swingkings.dk/join/[token]?x=1#y");
  });

  it("leaves every other address as it was", () => {
    expect(scrubUrl("https://swingkings.dk/oversigt")).toBe("https://swingkings.dk/oversigt");
    expect(scrubUrl("https://swingkings.dk/")).toBe("https://swingkings.dk/");
  });
});
