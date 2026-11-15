import { describe, expect, it } from "vitest";
import { pageMotion } from "@/lib/page-motion";
import { NAV_ITEMS, TAB_PATHS } from "@/components/nav-items";

describe("which way a page comes in", () => {
  it("comes in from the side its tab is on", () => {
    expect(pageMotion("/oversigt", "/boder", TAB_PATHS)).toBe("forward");
    expect(pageMotion("/boder", "/aktiviteter", TAB_PATHS)).toBe("forward");
    expect(pageMotion("/aktiviteter", "/boder", TAB_PATHS)).toBe("backward");
    expect(pageMotion("/aktiviteter", "/oversigt", TAB_PATHS)).toBe("backward");
  });

  it("goes by the tab, however deep either page is in it", () => {
    expect(pageMotion("/aktiviteter/abc", "/boder/historik", TAB_PATHS)).toBe("backward");
    expect(pageMotion("/boder/katalog", "/aktiviteter/abc", TAB_PATHS)).toBe("forward");
    // The old addresses belong to the activities tab.
    expect(pageMotion("/boder", "/opgaver", TAB_PATHS)).toBe("forward");
    expect(pageMotion("/oversigt", "/kampe/abc", TAB_PATHS)).toBe("forward");
  });

  it("opens a page deeper in the same tab and closes it on the way back up", () => {
    expect(pageMotion("/aktiviteter", "/aktiviteter/abc", TAB_PATHS)).toBe("open");
    expect(pageMotion("/aktiviteter/abc", "/aktiviteter", TAB_PATHS)).toBe("close");
    expect(pageMotion("/boder/spiller/abc", "/boder", TAB_PATHS)).toBe("close");
  });

  it("opens a page outside the tabs and closes it when a tab is gone back to", () => {
    expect(pageMotion("/boder", "/spiller/abc", TAB_PATHS)).toBe("open");
    expect(pageMotion("/spiller/abc", "/profil", TAB_PATHS)).toBe("open");
    expect(pageMotion("/profil", "/oversigt", TAB_PATHS)).toBe("close");
    expect(pageMotion("/hold/spillere", "/boder", TAB_PATHS)).toBe("close");
    // The chat is a button in the header now, not a tab: it opens over the tab one was on.
    expect(pageMotion("/boder", "/chat", TAB_PATHS)).toBe("open");
    expect(pageMotion("/chat", "/aktiviteter", TAB_PATHS)).toBe("close");
  });

  it("brings nothing in when the page stays where it is", () => {
    expect(pageMotion("/boder", "/boder", TAB_PATHS)).toBeNull();
    expect(pageMotion("/boder/historik", "/boder/katalog", TAB_PATHS)).toBeNull();
    expect(pageMotion("/aktiviteter/abc", "/aktiviteter/def", TAB_PATHS)).toBeNull();
  });

  it("does not take a path that only starts like a tab's for that tab", () => {
    expect(pageMotion("/oversigt", "/boderne", TAB_PATHS)).toBe("open");
  });

  it("knows the tabs in the order the tab bar shows them, admin last", () => {
    const tabs = NAV_ITEMS.filter((item) => !item.profile);
    expect(TAB_PATHS.slice(0, tabs.length).map((paths) => paths[0])).toEqual(tabs.map((item) => item.href));
    expect(TAB_PATHS.at(-1)).toEqual(["/admin"]);
  });

  it("opens one's own page and its settings over the tabs, though the profile has a tab of its own", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Hjem", "Bøder", "Aktiviteter", "Profil"]);
    expect(pageMotion("/boder", "/spiller/me", TAB_PATHS)).toBe("open");
    expect(pageMotion("/spiller/me", "/profil", TAB_PATHS)).toBe("open");
    expect(pageMotion("/profil", "/boder", TAB_PATHS)).toBe("close");
  });
});
