import { prisma } from "./prisma";

/**
 * Approves a reported challenge: the stake moves from the winner's fines to the loser's.
 * The winner gets a fine with negative units ("Vundet udfordring"), the loser one with
 * positive — both at the team's current price, so what the team is owed in all stays
 * the same. A winner cannot win his or her way below zero: the stake is cut to what the
 * winner still owes, and approving fails when that is nothing.
 *
 * One transaction, and guarded on the status: two people pressing "Godkend" at once
 * must not move the fines twice. The `updateMany … where status PENDING` is the lock —
 * whichever press gets there second updates nothing and writes nothing.
 */
export async function settleChallenge(
  challengeId: string,
  approvedById: string,
  now: Date = new Date(),
): Promise<{ ok: true; units: number } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        teamId: true,
        winnerId: true,
        loserId: true,
        reportedById: true,
        units: true,
        description: true,
        matchId: true,
        status: true,
        team: { select: { finePriceKr: true } },
      },
    });
    if (!challenge || challenge.status !== "PENDING") return { ok: false, error: "Udfordringen er ikke åben længere." };
    if (challenge.reportedById === approvedById) return { ok: false, error: "En anden end dig skal godkende den." };

    const open = await tx.fine.aggregate({
      where: { teamId: challenge.teamId, playerId: challenge.winnerId, clearedAt: null },
      _sum: { units: true },
    });
    const units = Math.min(challenge.units, Math.max(0, open._sum.units ?? 0));
    if (units === 0) return { ok: false, error: "Vinderen har ingen bøder at slippe af med." };

    const claimed = await tx.challenge.updateMany({
      where: { id: challengeId, status: "PENDING" },
      data: { status: "SETTLED", approvedById, settledAt: now, units },
    });
    if (claimed.count === 0) return { ok: false, error: "Udfordringen er allerede godkendt." };

    const fine = (playerId: string, sign: 1 | -1, reason: string) => ({
      teamId: challenge.teamId,
      playerId,
      reason: `${reason}: ${challenge.description}`,
      units: sign * units,
      unitPriceKr: challenge.team.finePriceKr,
      issuedById: approvedById,
      matchId: challenge.matchId,
      challengeId: challenge.id,
      createdAt: now,
    });
    await tx.fine.createMany({
      data: [fine(challenge.loserId, 1, "Tabt udfordring"), fine(challenge.winnerId, -1, "Vundet udfordring")],
    });
    return { ok: true, units };
  });
}

