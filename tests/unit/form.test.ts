import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_NAME, optionalId, optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { fail, invalid, ok, parsed } from "@/lib/action-result";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

describe("readForm", () => {
  const schema = z.object({ name: requiredText("Skriv et navn."), count: wholeNumber("Et tal fra 1 til 5.", 1, 5), note: optionalText, id: optionalId });

  it("returns trimmed fields, empty optionals as null", () => {
    expect(readForm(schema, form({ name: "  Anna ", count: "3", note: "", id: " " }))).toEqual({
      ok: true,
      fields: { name: "Anna", count: 3, note: null, id: null },
    });
  });

  it("gives the field's own message", () => {
    expect(readForm(schema, form({ name: " ", count: "3" }))).toEqual({ ok: false, error: "Skriv et navn." });
    expect(readForm(schema, form({ name: "A", count: "6" }))).toEqual({ ok: false, error: "Et tal fra 1 til 5." });
    expect(readForm(schema, form({ name: "A", count: "2.5" }))).toEqual({ ok: false, error: "Et tal fra 1 til 5." });
    expect(readForm(schema, form({ count: "1" }))).toEqual({ ok: false, error: "Skriv et navn." });
  });

  it("says how long text may be, in Danish", () => {
    expect(readForm(schema, form({ name: "x".repeat(MAX_NAME + 1), count: "1" }))).toEqual({
      ok: false,
      error: `Teksten er for lang (højst ${MAX_NAME} tegn).`,
    });
  });

  it("falls back to a general message when a schema gives none", () => {
    expect(readForm(z.object({ x: z.literal("y", { error: "" }) }), form({ x: "z" }))).toEqual({ ok: false, error: "Tjek felterne og prøv igen." });
  });
});

describe("action results", () => {
  it("leaves out an empty note", () => {
    expect(ok()).toEqual({ ok: true });
    expect(ok("")).toEqual({ ok: true });
    expect(ok("Gemt")).toEqual({ ok: true, note: "Gemt" });
    expect(fail("Nej")).toEqual({ ok: false, error: "Nej" });
    expect(parsed({ a: 1 })).toEqual({ ok: true, fields: { a: 1 } });
    expect(invalid("Nej")).toEqual({ ok: false, error: "Nej" });
  });
});
