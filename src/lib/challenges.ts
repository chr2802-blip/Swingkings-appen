import type { ChallengeStatus } from "@prisma/client";

/**
 * Who may move a challenge. Pure, so the rules are tested without a database and every
 * action asks the same function.
 *
 * A challenge is reported once it has been played, by the winner or the loser, with the
 * stake. Then it waits for one approval:
 *
 *   PENDING ──approve (anybody but the reporter)──▶ SETTLED   the stake moves
 *      └────cancel (the reporter, or the treasurer)──▶ CANCELLED
 *
 * Approving moves `units` fines from the winner to the loser (`settleChallenge`), so a
 * player can challenge his or her way out of the fines.
 */
export type ChallengeState = {
  status: ChallengeStatus;
  reportedById: string;
};

export type ChallengeMove = "approve" | "cancel";

/** Whether `userId` may make `move` now. `managesFines` is treasurer/admin on the team. */
export function canMove(c: ChallengeState, move: ChallengeMove, userId: string, managesFines: boolean): boolean {
  switch (move) {
    case "approve":
      return c.status === "PENDING" && c.reportedById !== userId;
    case "cancel":
      return c.status === "PENDING" && (c.reportedById === userId || managesFines);
  }
}

/** The moves open to `userId` now, in the order a screen offers them. */
export function movesFor(c: ChallengeState, userId: string, managesFines: boolean): ChallengeMove[] {
  const all: ChallengeMove[] = ["approve", "cancel"];
  return all.filter((move) => canMove(c, move, userId, managesFines));
}

/** Whether a challenge is waiting on `userId` to approve it. */
export function waitsOn(c: ChallengeState, userId: string) {
  return canMove(c, "approve", userId, false);
}

export const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  PENDING: "Venter på godkendelse",
  SETTLED: "Godkendt",
  CANCELLED: "Trukket tilbage",
};
