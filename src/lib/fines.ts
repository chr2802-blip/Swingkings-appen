import { prisma } from "./prisma";
import { loserOf } from "./challenges";

/**
 * Settles an accepted challenge: records the winner and writes the loser an ordinary
 * fine for the stake, at the team's current price of one fine.
 *
 * One transaction, and guarded on the status: two people pressing "confirm" at once
 * must not write the fine twice. The `updateMany … where status ACCEPTED` is the lock —
 * whichever press gets there second updates nothing and writes nothing. `Fine.challengeId`
 * is unique as a second line of defence.
 */
export async function settleChallenge(
  challengeId: string,
  winnerId: string,
  settledById: string,
  now: Date = new Date(),
): Promise<{ ok: true; loserId: string; fineId: string } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        teamId: true,
        challengerId: true,
        opponentId: true,
        units: true,
        description: true,
        matchId: true,
        status: true,
        team: { select: { finePriceKr: true } },
      },
    });
    if (!challenge || challenge.status !== "ACCEPTED") return { ok: false, error: "Udfordringen er ikke åben længere." };

    let loserId: string;
    try {
      loserId = loserOf(challenge, winnerId);
    } catch {
      return { ok: false, error: "Vinderen skal være en af de to spillere." };
    }

    const claimed = await tx.challenge.updateMany({
      where: { id: challengeId, status: "ACCEPTED" },
      data: { status: "SETTLED", winnerId, settledAt: now, claimedById: null, claimedWinnerId: null },
    });
    if (claimed.count === 0) return { ok: false, error: "Udfordringen er allerede afgjort." };

    const fine = await tx.fine.create({
      data: {
        teamId: challenge.teamId,
        playerId: loserId,
        reason: `Tabt udfordring: ${challenge.description}`,
        units: challenge.units,
        unitPriceKr: challenge.team.finePriceKr,
        issuedById: settledById,
        matchId: challenge.matchId,
        challengeId: challenge.id,
      },
      select: { id: true },
    });
    return { ok: true, loserId, fineId: fine.id };
  });
}
