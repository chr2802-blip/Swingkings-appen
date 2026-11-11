import { describe, expect, it } from "vitest";
import { calendarDaysBetween, deadlineLabel, deadlineOn, parseLocalDateTime, startOfMonthInZone } from "@/lib/time";

describe("time", () => {
  it("starts the month at midnight in Copenhagen, even when it is still last month in UTC", () => {
    expect(startOfMonthInZone(new Date("2026-11-11T12:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(startOfMonthInZone(new Date("2026-10-31T23:30:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(startOfMonthInZone(new Date("2026-07-15T08:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("puts a deadline at the end of that day in Copenhagen", () => {
    expect(deadlineOn("2026-10-23")?.toISOString()).toBe("2026-10-23T21:59:59.999Z");
    expect(deadlineOn("2026-12-23")?.toISOString()).toBe("2026-12-23T22:59:59.999Z");
  });

  it("refuses a day that does not exist", () => {
    expect(deadlineOn("2026-02-31")).toBeNull();
    expect(deadlineOn("nope")).toBeNull();
  });

  it("reads a datetime-local value on Copenhagen's clock", () => {
    expect(parseLocalDateTime("2026-10-17T14:30")?.toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(parseLocalDateTime("2026-11-07T13:00")?.toISOString()).toBe("2026-11-07T12:00:00.000Z");
  });

  it("counts calendar days on the team's clock, not the server's", () => {
    // 23:30 and 00:30 the next night in Copenhagen are one day apart though an hour apart.
    expect(calendarDaysBetween(new Date("2026-10-17T22:30:00Z"), new Date("2026-10-17T21:30:00Z"))).toBe(1);
  });

  it("says a passed deadline is overdue", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(deadlineLabel(deadlineOn("2026-10-19")!, now).overdue).toBe(true);
    expect(deadlineLabel(deadlineOn("2026-10-20")!, now)).toEqual({ text: "Frist i dag", overdue: false });
  });
});
