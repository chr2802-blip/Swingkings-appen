import type { ChallengeStatus } from "@prisma/client";

/**
 * Who may move a challenge. Pure, so the rules are tested without a database and every
 * action asks the same function.
 *
 * A challenge is reported once it has been played, by the winner or the loser, with the
 * stake. Then it waits for one approval:
 *
 *   PENDING ──approve (anybody but the reporter; an admin always)──▶ SETTLED   the stake moves
 *      └────cancel (the reporter, or the treasurer)──▶ deleted, shown nowhere
 *
 * Approving moves `units` fines from the winner to the loser (`settleChallenge`), so a
 * player can challenge his or her way out of the fines.
 */
export type ChallengeState = {
  status: ChallengeStatus;
  reportedById: string;
};

export type ChallengeMove = "approve" | "cancel";

/**
 * What the viewer is on the team: `managesFines` (treasurer or admin, `canManageFines`)
 * withdraws anybody's; `administers` (`canAdministerTeam`) approves any — their own too.
 */
export type ChallengeRights = { managesFines: boolean; administers: boolean };

export const NO_RIGHTS: ChallengeRights = { managesFines: false, administers: false };

/** Whether `userId` may make `move` now. */
export function canMove(c: ChallengeState, move: ChallengeMove, userId: string, rights: ChallengeRights): boolean {
  switch (move) {
    case "approve":
      return c.status === "PENDING" && (c.reportedById !== userId || rights.administers);
    case "cancel":
      return c.status === "PENDING" && (c.reportedById === userId || rights.managesFines);
  }
}

/** The moves open to `userId` now, in the order a screen offers them. */
export function movesFor(c: ChallengeState, userId: string, rights: ChallengeRights): ChallengeMove[] {
  const all: ChallengeMove[] = ["approve", "cancel"];
  return all.filter((move) => canMove(c, move, userId, rights));
}

/**
 * Whether a challenge is waiting on `userId` to approve it: somebody else reported it. An
 * admin may approve their own too, but it is not waiting on them.
 */
export function waitsOn(c: ChallengeState, userId: string) {
  return canMove(c, "approve", userId, NO_RIGHTS);
}

export const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  PENDING: "Venter på godkendelse",
  SETTLED: "Godkendt",
};
