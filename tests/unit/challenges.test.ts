import { describe, expect, it } from "vitest";
import { NO_RIGHTS, canMove, movesFor, waitsOn, type ChallengeState } from "@/lib/challenges";

const reported: ChallengeState = { status: "PENDING", reportedById: "anna" };
const treasurer = { managesFines: true, administers: false };
const admin = { managesFines: true, administers: true };

describe("challenge moves", () => {
  it("lets anybody but the reporter approve", () => {
    expect(movesFor(reported, "bo", NO_RIGHTS)).toEqual(["approve"]);
    expect(movesFor(reported, "carl", NO_RIGHTS)).toEqual(["approve"]);
    expect(canMove(reported, "approve", "anna", treasurer)).toBe(false);
  });

  it("lets an admin approve any, their own too", () => {
    expect(canMove(reported, "approve", "anna", admin)).toBe(true);
    expect(movesFor(reported, "anna", admin)).toEqual(["approve", "cancel"]);
    // Still, their own is not waiting on them.
    expect(waitsOn(reported, "anna")).toBe(false);
  });

  it("lets the reporter withdraw, and a treasurer too", () => {
    expect(movesFor(reported, "anna", NO_RIGHTS)).toEqual(["cancel"]);
    expect(movesFor(reported, "carl", treasurer)).toEqual(["approve", "cancel"]);
    expect(canMove(reported, "cancel", "bo", NO_RIGHTS)).toBe(false);
  });

  it("waits on everybody but the reporter", () => {
    expect(waitsOn(reported, "bo")).toBe(true);
    expect(waitsOn(reported, "anna")).toBe(false);
  });

  it("allows nothing on a settled challenge", () => {
    const settled = { ...reported, status: "SETTLED" as const };
    expect(movesFor(settled, "anna", admin)).toEqual([]);
    expect(movesFor(settled, "bo", admin)).toEqual([]);
    expect(waitsOn(settled, "bo")).toBe(false);
  });
});
