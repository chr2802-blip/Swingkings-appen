import type { MemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

let counter = 0;

export async function makeTeam(name = "Swingkings") {
  return prisma.team.create({ data: { name } });
}

export async function makeMember(teamId: string, name: string, role: MemberRole = "PLAYER") {
  counter++;
  return prisma.user.create({
    data: {
      email: `${name.toLowerCase().replace(/\W/g, "")}${counter}@test.dk`,
      name,
      passwordHash: "x",
      memberships: { create: { teamId, role } },
    },
  });
}
