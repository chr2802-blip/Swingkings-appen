import { describe, expect, it } from "vitest";
import { FEED_SEARCH_MAX, readFeedSearch } from "@/lib/feed-page";

describe("readFeedSearch", () => {
  it("trims and folds the spaces, and cuts a long search", () => {
    expect(readFeedSearch("  husk   benskinner ")).toBe("husk benskinner");
    expect(readFeedSearch("x".repeat(FEED_SEARCH_MAX + 50))).toHaveLength(FEED_SEARCH_MAX);
  });

  it("answers null for too little to search for, or for anything but words", () => {
    expect(readFeedSearch("")).toBeNull();
    expect(readFeedSearch("  a  ")).toBeNull();
    expect(readFeedSearch(null)).toBeNull();
    expect(readFeedSearch(["husk"])).toBeNull();
    expect(readFeedSearch("ab")).toBe("ab");
  });
});
