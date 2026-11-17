import { describe, expect, it } from "vitest";
import { possessive } from "@/lib/names";

describe("possessive", () => {
  it("adds an s, or only an apostrophe after s, x and z", () => {
    expect(possessive("Anna")).toBe("Annas");
    expect(possessive("Bo")).toBe("Bos");
    expect(possessive("Mads")).toBe("Mads'");
    expect(possessive("Max")).toBe("Max'");
    expect(possessive("Fritz")).toBe("Fritz'");
    expect(possessive("Anna Berg ")).toBe("Anna Bergs");
  });
});
