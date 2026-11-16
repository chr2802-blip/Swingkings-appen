import { describe, expect, it } from "vitest";
import { backHref } from "@/lib/back-link";

const me = "/spiller/me";

describe("where the back arrow leads", () => {
  it("leaves the tabs without one", () => {
    for (const path of [
      "/oversigt",
      "/boder",
      "/boder/historik",
      "/boder/katalog",
      "/aktiviteter",
      "/admin",
    ]) {
      expect(backHref(path, me)).toBeNull();
    }
  });

  it("takes an activity or a task up to the activities", () => {
    expect(backHref("/aktiviteter/abc", me)).toBe("/aktiviteter");
    expect(backHref("/aktiviteter/abc/", me)).toBe("/aktiviteter");
    expect(backHref("/opgaver/abc", me)).toBe("/aktiviteter");
    expect(backHref("/kampe/abc", me)).toBe("/aktiviteter");
    expect(backHref("/aktiviteter/abc/opgaver", me)).toBe("/aktiviteter");
    expect(backHref("/aktiviteter/abc/boder", me)).toBe("/aktiviteter");
  });

  it("leaves your own page without one: it is the profile tab", () => {
    expect(backHref(me, me)).toBeNull();
    for (const tab of ["/boder", "/udfordringer", "/opgaver"])
      expect(backHref(`${me}${tab}`, me)).toBeNull();
  });

  it("takes another player's page, the chat, the settings and the roster home", () => {
    expect(backHref("/spiller/abc", me)).toBe("/oversigt");
    expect(backHref("/spiller/abc/opgaver", me)).toBe("/oversigt");
    expect(backHref("/chat", me)).toBe("/oversigt");
    expect(backHref("/hold", me)).toBe("/oversigt");
    expect(backHref("/hold/inviter", me)).toBe("/oversigt");
    expect(backHref("/hold/spillere", me)).toBe("/oversigt");
  });

  it("takes the season pages to where they are opened from", () => {
    expect(backHref("/hold/saeson", me)).toBe("/hold");
    expect(backHref("/hold/saesoner", me)).toBe("/hold/spillere");
  });

  it("takes the profile settings to your own page, unless you are on no team", () => {
    expect(backHref("/profil", me)).toBe(me);
    expect(backHref("/profil", "/profil")).toBeNull();
    expect(backHref("/hold/vaelg", "/profil")).toBeNull();
  });
});
