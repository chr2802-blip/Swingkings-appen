import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { settleChallenge } from "@/lib/fines";
import { makeMember, makeTeam } from "./factory";

describe("settleChallenge", () => {
  async function accepted() {
    const team = await prisma.team.update({ where: { id: (await makeTeam()).id }, data: { finePriceKr: 20 } });
    const anna = await makeMember(team.id, "Anna");
    const bo = await makeMember(team.id, "Bo");
    const challenge = await prisma.challenge.create({
      data: { teamId: team.id, challengerId: anna.id, opponentId: bo.id, description: "Første mål", units: 3, status: "ACCEPTED" },
    });
    return { team, anna, bo, challenge };
  }

  it("writes the loser a fine for the stake at the team's price", async () => {
    const { anna, bo, challenge } = await accepted();
    const result = await settleChallenge(challenge.id, anna.id, anna.id);
    expect(result).toMatchObject({ ok: true, loserId: bo.id });

    const fine = await prisma.fine.findFirstOrThrow({ where: { challengeId: challenge.id } });
    expect(fine).toMatchObject({ playerId: bo.id, units: 3, unitPriceKr: 20, reason: "Tabt udfordring: Første mål" });
    const after = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(after).toMatchObject({ status: "SETTLED", winnerId: anna.id });
  });

  it("writes one fine however many presses arrive at once", async () => {
    const { anna, bo, challenge } = await accepted();
    const results = await Promise.all([
      settleChallenge(challenge.id, anna.id, anna.id),
      settleChallenge(challenge.id, anna.id, bo.id),
      settleChallenge(challenge.id, bo.id, bo.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.fine.count({ where: { challengeId: challenge.id } })).toBe(1);
  });

  it("refuses a winner who is not one of the two, and a challenge not yet accepted", async () => {
    const { team, anna, challenge } = await accepted();
    const carl = await makeMember(team.id, "Carl");
    expect(await settleChallenge(challenge.id, carl.id, anna.id)).toMatchObject({ ok: false });
    await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "PENDING" } });
    expect(await settleChallenge(challenge.id, anna.id, anna.id)).toMatchObject({ ok: false });
    expect(await prisma.fine.count()).toBe(0);
  });
});
