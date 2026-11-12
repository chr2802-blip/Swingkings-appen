import { describe, expect, it } from "vitest";
import { FEED_PAGE, decodeFeedCursor, encodeFeedCursor, nextFeedCursor } from "@/lib/feed";
import { FEED_PAGE as FROM_PAGE_MODULE } from "@/lib/feed-page";

const post = (iso: string, id: string) => ({ createdAt: new Date(iso), id });

describe("the feed's cursor", () => {
  it("round-trips a post's place in the order", () => {
    const at = post("2026-11-12T07:00:00.123Z", "cmabc_12-3");
    expect(encodeFeedCursor(at)).toBe("2026-11-12T07:00:00.123Z_cmabc_12-3");
    expect(decodeFeedCursor(encodeFeedCursor(at))).toEqual(at);
  });

  it("refuses anything that is not one", () => {
    for (const bad of ["", "nej", "2026-11-12_abc", "2026-11-12T07:00:00.123Z_", "2026-11-12T07:00:00.123Z_a b", "2026-13-45T99:99:99.999Z_x", `2026-11-12T07:00:00.123Z_${"x".repeat(65)}`]) {
      expect(decodeFeedCursor(bad), bad).toBeNull();
    }
  });

  it("points past a full page, and nowhere after the last one", () => {
    const page = Array.from({ length: 3 }, (_, i) => post(`2026-11-1${i}T10:00:00.000Z`, `p${i}`));
    expect(nextFeedCursor(page, 3)).toBe("2026-11-12T10:00:00.000Z_p2");
    expect(nextFeedCursor(page, 4)).toBeNull();
    expect(nextFeedCursor([], 3)).toBeNull();
  });

  it("pages ten posts at a time, one number for both modules", () => {
    expect(FEED_PAGE).toBe(10);
    expect(FROM_PAGE_MODULE).toBe(FEED_PAGE);
  });
});
