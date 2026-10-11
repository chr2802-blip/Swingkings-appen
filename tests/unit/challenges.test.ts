import { describe, expect, it } from "vitest";
import { canMove, loserOf, movesFor, type ChallengeState } from "@/lib/challenges";

const base: ChallengeState = {
  status: "PENDING",
  challengerId: "anna",
  opponentId: "bo",
  claimedById: null,
  claimedWinnerId: null,
};

describe("challenge moves", () => {
  it("lets only the opponent accept or decline a pending challenge", () => {
    expect(movesFor(base, "bo", false)).toEqual(["accept", "decline"]);
    expect(movesFor(base, "anna", false)).toEqual(["cancel"]);
    expect(movesFor(base, "carl", false)).toEqual([]);
  });

  it("lets a treasurer cancel a pending challenge, but not accept it", () => {
    expect(movesFor(base, "carl", true)).toEqual(["cancel"]);
  });

  it("lets either player claim a winner once accepted, and a treasurer settle", () => {
    const accepted = { ...base, status: "ACCEPTED" as const };
    expect(movesFor(accepted, "anna", false)).toEqual(["claim"]);
    expect(movesFor(accepted, "bo", false)).toEqual(["claim"]);
    expect(movesFor(accepted, "carl", true)).toEqual(["settle"]);
  });

  it("lets only the other player confirm or dispute a claim", () => {
    const claimed = { ...base, status: "ACCEPTED" as const, claimedById: "anna", claimedWinnerId: "anna" };
    expect(movesFor(claimed, "anna", false)).toEqual([]);
    expect(movesFor(claimed, "bo", false)).toEqual(["confirm", "dispute"]);
    expect(canMove(claimed, "claim", "bo", false)).toBe(false);
  });

  it("allows nothing on a finished challenge", () => {
    for (const status of ["SETTLED", "DECLINED", "CANCELLED"] as const) {
      expect(movesFor({ ...base, status }, "anna", true)).toEqual([]);
      expect(movesFor({ ...base, status }, "bo", true)).toEqual([]);
    }
  });

  it("names the loser", () => {
    expect(loserOf(base, "anna")).toBe("bo");
    expect(loserOf(base, "bo")).toBe("anna");
    expect(() => loserOf(base, "carl")).toThrow();
  });
});
