import { describe, expect, it } from "vitest";
import { PUSH_CATEGORIES, bellLabel, mutedFromForm, opensOutside, pushes } from "@/lib/notification-categories";

const form = (on: string[]) => {
  const data = new FormData();
  for (const value of on) data.append("on", value);
  return data;
};

describe("the notification settings", () => {
  it("offer every category but TEAM, which cannot be turned off", () => {
    expect(PUSH_CATEGORIES.map((c) => c.value)).toEqual(["FINES", "CHALLENGES", "TASKS", "REMINDERS", "ACTIVITIES", "FEED", "COMMENTS", "CHAT"]);
  });

  it("mute what is not ticked", () => {
    expect(mutedFromForm(form(PUSH_CATEGORIES.map((c) => c.value)))).toEqual([]);
    expect(mutedFromForm(form(["FINES", "CHAT"]))).toEqual(["CHALLENGES", "TASKS", "REMINDERS", "ACTIVITIES", "FEED", "COMMENTS"]);
    expect(mutedFromForm(form([]))).toHaveLength(PUSH_CATEGORIES.length);
  });

  it("refuse a category there is none of, or one that cannot be muted", () => {
    expect(mutedFromForm(form(["FINES", "SPAM"]))).toBeNull();
    expect(mutedFromForm(form(["TEAM"]))).toBeNull();
  });
});

describe("pushes", () => {
  it("leaves out a muted category, but never TEAM or what waits on the person", () => {
    expect(pushes("FEED", [])).toBe(true);
    expect(pushes("FEED", ["FEED"])).toBe(false);
    expect(pushes("FINES", ["FINES"], true)).toBe(true);
    expect(pushes("TEAM", ["FEED", "FINES"])).toBe(true);
  });
});

describe("the bell", () => {
  it("counts up to 99, then says 99+", () => {
    expect(bellLabel(1)).toBe("1");
    expect(bellLabel(99)).toBe("99");
    expect(bellLabel(100)).toBe("99+");
  });

  it("knows a notification that opens outside the app", () => {
    expect(opensOutside("https://qr.mobilepay.dk/box/x/pay-in")).toBe(true);
    expect(opensOutside("/boder")).toBe(false);
    expect(opensOutside("/oversigt#feed")).toBe(false);
  });
});
