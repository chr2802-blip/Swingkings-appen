import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { makeMember, makeTeam } from "./factory";

describe("teamDb", () => {
  it("never reads, changes or deletes another team's rows", async () => {
    const ours = await makeTeam("Os");
    const theirs = await makeTeam("Dem");
    const them = await makeMember(theirs.id, "Fremmed", "ADMIN");
    const fine = await prisma.fine.create({
      data: { teamId: theirs.id, playerId: them.id, reason: "Deres bøde", units: 1, unitPriceKr: 10, issuedById: them.id },
    });

    const db = teamDb(ours.id);
    expect(await db.fine.findMany()).toEqual([]);
    expect(await db.fine.findFirst({ where: { id: fine.id } })).toBeNull();
    expect((await db.fine.updateMany({ where: { id: fine.id }, data: { units: 99 } })).count).toBe(0);
    expect((await db.fine.deleteMany({ where: { id: fine.id } })).count).toBe(0);
    expect(await prisma.fine.findUniqueOrThrow({ where: { id: fine.id } })).toMatchObject({ units: 1 });
  });

  it("stamps the team on what it creates, whatever the caller wrote", async () => {
    const ours = await makeTeam("Os");
    const theirs = await makeTeam("Dem");
    const created = await teamDb(ours.id).fineType.create({ data: { teamId: theirs.id, name: "Snydt", units: 2 } });
    expect(created.teamId).toBe(ours.id);
  });

  it("refuses models that carry no team of their own", async () => {
    const ours = await makeTeam("Os");
    await expect(teamDb(ours.id).taskAssignee.findMany()).rejects.toThrow(/carries no teamId/);
    await expect(teamDb(ours.id).user.findMany()).rejects.toThrow(/carries no teamId/);
  });
});
