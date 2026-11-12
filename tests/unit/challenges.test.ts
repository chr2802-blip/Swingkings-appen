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

  it("allows nothing on a finished challenge", () => {
    for (const status of ["SETTLED", "CANCELLED"] as const) {
      expect(movesFor({ ...reported, status }, "anna", true)).toEqual([]);
      expect(movesFor({ ...reported, status }, "bo", true)).toEqual([]);
      expect(waitsOn({ ...reported, status }, "bo")).toBe(false);
    }
  });
});
