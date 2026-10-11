import type { ChallengeStatus } from "@prisma/client";

/**
 * Who may move a challenge, and where to. Pure, so the rules are tested without a
 * database and every action asks the same function.
 *
 * The life of a challenge:
 *
 *   PENDING ──accept──▶ ACCEPTED ──claim──▶ (claimed) ──confirm──▶ SETTLED
 *      │                   │                    │
 *      ├─decline─▶ DECLINED│                    └─dispute──▶ ACCEPTED (claim cleared)
 *      └─cancel──▶ CANCELLED                    
 *
 * A winner is agreed by both players: one claims it, the other confirms. A treasurer or
 * admin can settle an accepted challenge directly, which is how a dispute ends. Settling
 * writes the loser an ordinary Fine for `units` fines (`settleChallenge`).
 */
export type ChallengeState = {
  status: ChallengeStatus;
  challengerId: string;
  opponentId: string;
  claimedById: string | null;
  claimedWinnerId: string | null;
};

export type ChallengeMove = "accept" | "decline" | "cancel" | "claim" | "confirm" | "dispute" | "settle";

export function isParticipant(c: ChallengeState, userId: string) {
  return c.challengerId === userId || c.opponentId === userId;
}

/** Whether `userId` may make `move` now. `managesFines` is treasurer/admin on the team. */
export function canMove(c: ChallengeState, move: ChallengeMove, userId: string, managesFines: boolean): boolean {
  switch (move) {
    case "accept":
    case "decline":
      return c.status === "PENDING" && c.opponentId === userId;
    case "cancel":
      return c.status === "PENDING" && (c.challengerId === userId || managesFines);
    case "claim":
      return c.status === "ACCEPTED" && c.claimedById === null && isParticipant(c, userId);
    case "confirm":
    case "dispute":
      // The other player answers a claim — never the one who made it.
      return (
        c.status === "ACCEPTED" && c.claimedById !== null && isParticipant(c, userId) && c.claimedById !== userId
      );
    case "settle":
      return c.status === "ACCEPTED" && managesFines;
  }
}

/** The moves open to `userId` now, in the order a screen offers them. */
export function movesFor(c: ChallengeState, userId: string, managesFines: boolean): ChallengeMove[] {
  const all: ChallengeMove[] = ["accept", "decline", "cancel", "claim", "confirm", "dispute", "settle"];
  return all.filter((move) => canMove(c, move, userId, managesFines));
}

/** The loser, given the winner. Throws for a winner who is not one of the two. */
export function loserOf(c: Pick<ChallengeState, "challengerId" | "opponentId">, winnerId: string) {
  if (winnerId === c.challengerId) return c.opponentId;
  if (winnerId === c.opponentId) return c.challengerId;
  throw new Error("The winner must be one of the two players");
}

export const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  PENDING: "Afventer svar",
  ACCEPTED: "Accepteret",
  DECLINED: "Afvist",
  CANCELLED: "Trukket tilbage",
  SETTLED: "Afgjort",
};
