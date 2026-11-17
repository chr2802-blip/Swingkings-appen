import { describe, expect, it } from "vitest";
import { QUOTE_LENGTH, quoteOf } from "@/lib/chat-quote";

const message = (body: string, photos: unknown[] = []) => ({ id: "m", body, author: { name: "Anna" }, photos });

describe("quoteOf", () => {
  it("quotes whose message it was and its words on one line", () => {
    expect(quoteOf(message("Hvem\n  kører  i morgen?"))).toEqual({ id: "m", authorName: "Anna", body: "Hvem kører i morgen?", photo: false });
  });

  it("cuts long words short with an ellipsis", () => {
    const quoted = quoteOf(message("ord ".repeat(100)));
    expect(quoted.body.length).toBeLessThanOrEqual(QUOTE_LENGTH);
    expect(quoted.body.endsWith("…")).toBe(true);
  });

  it("says when the message was a picture", () => {
    expect(quoteOf(message("", ["p"]))).toMatchObject({ body: "", photo: true });
  });
});
