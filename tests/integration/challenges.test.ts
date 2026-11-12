import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { settleChallenge } from "@/lib/fines";
import { makeMember, makeTeam } from "../helpers/factories";

describe("settleChallenge", () => {
  /** Anna owes `owed` fines and reports beating Bo for `units`; Carl is a third player. */
  async function reported(units = 3, owed = 5) {
    const team = await prisma.team.update({ where: { id: (await makeTeam()).id }, data: { finePriceKr: 20 } });
    const anna = await makeMember(team.id, "Anna");
    const bo = await makeMember(team.id, "Bo");
    const carl = await makeMember(team.id, "Carl");
    if (owed > 0) {
      await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "For sent", units: owed, unitPriceKr: 10, issuedById: carl.id } });
    }
    const challenge = await prisma.challenge.create({
      data: { teamId: team.id, reportedById: anna.id, winnerId: anna.id, loserId: bo.id, description: "Første mål", units },
    });
    return { team, anna, bo, carl, challenge };
  }

  it("moves the stake from the winner to the loser at the team's price", async () => {
    const { anna, bo, carl, challenge } = await reported(3);
    expect(await settleChallenge(challenge.id, carl.id)).toEqual({ ok: true, units: 3 });

    const fines = await prisma.fine.findMany({ where: { challengeId: challenge.id }, orderBy: { units: "asc" } });
    expect(fines).toMatchObject([
      { playerId: anna.id, units: -3, unitPriceKr: 20, reason: "Vundet udfordring: Første mål", issuedById: carl.id },
      { playerId: bo.id, units: 3, unitPriceKr: 20, reason: "Tabt udfordring: Første mål", issuedById: carl.id },
    ]);
    expect(await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).toMatchObject({
      status: "SETTLED",
      approvedById: carl.id,
    });
  });

  it("moves it once however many approvals arrive at once", async () => {
    const { bo, carl, challenge } = await reported();
    const results = await Promise.all([settleChallenge(challenge.id, bo.id), settleChallenge(challenge.id, carl.id), settleChallenge(challenge.id, carl.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.fine.count({ where: { challengeId: challenge.id } })).toBe(2);
  });

  it("cuts the stake to what the winner still owes, and refuses when that is nothing", async () => {
    const first = await reported(5, 2);
    expect(await settleChallenge(first.challenge.id, first.carl.id)).toEqual({ ok: true, units: 2 });
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: first.challenge.id } })).units).toBe(2);

    const second = await reported(1, 0);
    expect(await settleChallenge(second.challenge.id, second.carl.id)).toEqual({ ok: false, error: "Vinderen har ingen bøder at slippe af med." });
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: second.challenge.id } })).status).toBe("PENDING");
  });

  it("does not count fines the treasurer has reset", async () => {
    const { anna, carl, challenge } = await reported(3, 5);
    await prisma.fine.updateMany({ where: { playerId: anna.id }, data: { clearedAt: new Date() } });
    expect(await settleChallenge(challenge.id, carl.id)).toMatchObject({ ok: false });
  });

  it("refuses the reporter, and a challenge no longer pending", async () => {
    const { anna, carl, challenge } = await reported();
    expect(await settleChallenge(challenge.id, anna.id)).toEqual({ ok: false, error: "En anden end dig skal godkende den." });
    await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "CANCELLED" } });
    expect(await settleChallenge(challenge.id, carl.id)).toEqual({ ok: false, error: "Udfordringen er ikke åben længere." });
    expect(await prisma.fine.count({ where: { challengeId: challenge.id } })).toBe(0);
  });

  it("cannot be made to spend the same fines twice by approving two challenges at once", async () => {
    const { team, anna, bo, carl, challenge } = await reported(3, 3);
    const second = await prisma.challenge.create({
      data: { teamId: team.id, reportedById: anna.id, winnerId: anna.id, loserId: carl.id, description: "Andet mål", units: 3 },
    });
    const results = await Promise.all([settleChallenge(challenge.id, carl.id), settleChallenge(second.id, bo.id)]);
    // Anna owes three fines in all: one challenge moves them, the other finds nothing left.
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const open = await prisma.fine.aggregate({ where: { playerId: anna.id, clearedAt: null }, _sum: { units: true } });
    expect(open._sum.units).toBe(0);
  });
});
