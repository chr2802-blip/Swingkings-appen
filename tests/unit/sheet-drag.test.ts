import { describe, expect, it } from "vitest";
import { backdropOpacity, CLOSE_PX, followPull, letsClose, pullIntent } from "@/lib/sheet-drag";

describe("pulling a sheet down to close it", () => {
  it("waits until the finger has gone somewhere, then tells a pull from scrolling or sideways", () => {
    expect(pullIntent(3, 5)).toBe("undecided");
    expect(pullIntent(2, 20)).toBe("pull");
    expect(pullIntent(0, -20)).toBe("other");
    expect(pullIntent(20, 4)).toBe("other");
    expect(pullIntent(-20, 4)).toBe("other");
    expect(pullIntent(10, 10)).toBe("other");
  });

  it("follows the finger down, and gives only a little way upwards", () => {
    expect(followPull(90)).toBe(90);
    expect(followPull(0)).toBe(0);
    expect(followPull(-4)).toBe(-2);
    expect(followPull(-400)).toBe(-12);
  });

  it("closes past a third of a short sheet, or a fixed distance on a tall one", () => {
    expect(letsClose(70, 200, 0)).toBe(true);
    expect(letsClose(60, 200, 0)).toBe(false);
    expect(letsClose(CLOSE_PX, 800, 0)).toBe(true);
    expect(letsClose(CLOSE_PX - 1, 800, 0.1)).toBe(false);
  });

  it("closes on a flick, but not on a twitch", () => {
    expect(letsClose(50, 800, 0.8)).toBe(true);
    expect(letsClose(20, 800, 2)).toBe(false);
    expect(letsClose(50, 800, 0.2)).toBe(false);
  });

  it("lifts the dimming as the sheet goes down", () => {
    expect(backdropOpacity(0, 400)).toBe(1);
    expect(backdropOpacity(-10, 400)).toBe(1);
    expect(backdropOpacity(100, 400)).toBe(0.75);
    expect(backdropOpacity(600, 400)).toBe(0);
  });
});
