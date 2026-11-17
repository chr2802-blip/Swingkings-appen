import { describe, expect, it } from "vitest";
import { canMove, movesFor, waitsOn, type ChallengeState } from "@/lib/challenges";

const reported: ChallengeState = { status: "PENDING", reportedById: "anna" };

describe("challenge moves", () => {
  it("lets anybody but the reporter approve", () => {
    expect(movesFor(reported, "bo", false)).toEqual(["approve"]);
    expect(movesFor(reported, "carl", false)).toEqual(["approve"]);
    expect(canMove(reported, "approve", "anna", true)).toBe(false);
  });

  it("lets the reporter withdraw, and a treasurer too", () => {
    expect(movesFor(reported, "anna", false)).toEqual(["cancel"]);
    expect(movesFor(reported, "carl", true)).toEqual(["approve", "cancel"]);
    expect(canMove(reported, "cancel", "bo", false)).toBe(false);
  });

  it("waits on everybody but the reporter", () => {
    expect(waitsOn(reported, "bo")).toBe(true);
    expect(waitsOn(reported, "anna")).toBe(false);
  });

  it("allows nothing on a settled challenge", () => {
    const settled = { ...reported, status: "SETTLED" as const };
    expect(movesFor(settled, "anna", true)).toEqual([]);
    expect(movesFor(settled, "bo", true)).toEqual([]);
    expect(waitsOn(settled, "bo")).toBe(false);
  });
});
