import { describe, expect, it } from "vitest";
import { EDGE_PX, followFinger, letsGoBack, startsAtEdge, swipeIntent } from "@/lib/edge-swipe";

describe("swiping back from the left edge", () => {
  it("starts only at the very edge, so a sideways swipe inside the page keeps its own", () => {
    expect(startsAtEdge(0)).toBe(true);
    expect(startsAtEdge(EDGE_PX)).toBe(true);
    expect(startsAtEdge(EDGE_PX + 1)).toBe(false);
    expect(startsAtEdge(200)).toBe(false);
  });

  it("waits until the finger has gone somewhere, then tells back from scrolling", () => {
    expect(swipeIntent(3, 2)).toBe("undecided");
    expect(swipeIntent(20, 4)).toBe("back");
    expect(swipeIntent(4, 20)).toBe("other");
    expect(swipeIntent(-20, 0)).toBe("other");
    expect(swipeIntent(10, 10)).toBe("other");
  });

  it("lets the page follow the finger to the right, never past where it was to the left", () => {
    expect(followFinger(120)).toBe(120);
    expect(followFinger(-30)).toBe(0);
  });

  it("goes back past a third of the screen, or on a flick, and otherwise slides back", () => {
    expect(letsGoBack(140, 390, 0)).toBe(true);
    expect(letsGoBack(100, 390, 0.1)).toBe(false);
    expect(letsGoBack(60, 390, 0.8)).toBe(true);
    expect(letsGoBack(20, 390, 2)).toBe(false);
  });
});
