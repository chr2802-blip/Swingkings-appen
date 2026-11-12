import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCalendar } from "@/lib/kampklar";

afterEach(() => vi.restoreAllMocks());

/** A response that streams `chunks` of `size` bytes and says nothing about its length. */
function streaming(chunks: number, size: number, onRead: () => void) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      onRead();
      if (sent++ >= chunks) return controller.close();
      controller.enqueue(new TextEncoder().encode("A".repeat(size)));
    },
  });
  return new Response(body, { status: 200 });
}

describe("fetchCalendar", () => {
  it("stops reading a feed that never ends, without being told its length", async () => {
    let reads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => streaming(10_000, 100_000, () => reads++));
    expect(await fetchCalendar("https://8.8.8.8/kalender.ics")).toEqual({ ok: false, error: "Kalenderen er for stor." });
    // Cancelled just past two megabytes, not read to the end.
    expect(reads).toBeLessThan(40);
  });

  it("reads an ordinary feed whole", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"));
    expect(await fetchCalendar("https://8.8.8.8/kalender.ics")).toEqual({ ok: true, text: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" });
  });
});
