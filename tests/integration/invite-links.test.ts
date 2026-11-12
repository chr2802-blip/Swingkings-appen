import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateLinkToken, hashLinkToken, findInviteLink, redeemInviteLink } from "@/lib/invite-links";
import { makeMember, makeTeam } from "../helpers/factories";

let clientIp = "203.0.113.1";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": clientIp }),
}));

const { takeAttempt, attemptsAllowed } = await import("@/lib/rate-limit");

async function makeLink(teamId: string, createdById: string, maxUses: number, expiresInMs = 60 * 60 * 1000) {
  const token = generateLinkToken();
  const link = await prisma.inviteLink.create({
    data: { teamId, createdById, tokenHash: hashLinkToken(token), maxUses, expiresAt: new Date(Date.now() + expiresInMs) },
  });
  return { token, link };
}

let n = 0;
const newcomer = () => ({ newUser: { email: `ny${++n}@test.dk`, name: `Ny ${n}`, passwordHash: "x" } });

describe("invitation links", () => {
  it("are found by their token, and only by it", async () => {
    const team = await makeTeam();
    const coach = await makeMember(team.id, "Træner", "ADMIN");
    const { token, link } = await makeLink(team.id, coach.id, 5);
    expect((await findInviteLink(token))?.id).toBe(link.id);
    expect((await findInviteLink(token))?.team.name).toBe(team.name);
    expect(await findInviteLink(generateLinkToken())).toBeNull();
    expect(await findInviteLink("")).toBeNull();
  });

  it("make an account and a player membership, and count the place", async () => {
    const team = await makeTeam();
    const coach = await makeMember(team.id, "Træner", "ADMIN");
    const { link } = await makeLink(team.id, coach.id, 5);
    const result = await redeemInviteLink(link.id, newcomer());
    expect(result).toMatchObject({ ok: true, teamId: team.id, joined: true });
    if (!result.ok) return;
    const member = await prisma.teamMember.findUniqueOrThrow({
      where: { userId_teamId: { userId: result.userId, teamId: team.id } },
      include: { user: true },
    });
    expect(member.role).toBe("PLAYER");
    expect(member.user.activeTeamId).toBe(team.id);
    expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(1);
  });

  it("never let more people in than maxUses, even all at once", async () => {
    const team = await makeTeam();
    const coach = await makeMember(team.id, "Træner", "ADMIN");
    const { link } = await makeLink(team.id, coach.id, 3);
    const results = await Promise.all(Array.from({ length: 8 }, () => redeemInviteLink(link.id, newcomer())));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.problem === "used-up")).toBe(true);
    expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(3);
    // A refused sign-up leaves no account behind.
    expect(await prisma.user.count()).toBe(1 + 3);
  });

  it("refuse an expired link and make no account", async () => {
    const team = await makeTeam();
    const coach = await makeMember(team.id, "Træner", "ADMIN");
    const { link } = await makeLink(team.id, coach.id, 5, -1000);
    expect(await redeemInviteLink(link.id, newcomer())).toEqual({ ok: false, problem: "expired" });
    expect(await prisma.user.count()).toBe(1);
  });

  it("let an existing account join, and take no place or role from somebody already on the team", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andet hold");
    const coach = await makeMember(team.id, "Træner", "ADMIN");
    const elsewhere = await makeMember(other.id, "Fra et andet hold");
    const { link } = await makeLink(team.id, coach.id, 5);

    expect(await redeemInviteLink(link.id, { userId: elsewhere.id })).toMatchObject({ ok: true, joined: true });
    expect(await redeemInviteLink(link.id, { userId: coach.id })).toMatchObject({ ok: true, joined: false });

    const coachMembership = await prisma.teamMember.findUniqueOrThrow({
      where: { userId_teamId: { userId: coach.id, teamId: team.id } },
    });
    expect(coachMembership.role).toBe("ADMIN");
    expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(1);
  });
});

describe("sign-up limit", () => {
  it("stops accounts from one address after the limit, but not from another", async () => {
    clientIp = "203.0.113.7";
    const allowed = attemptsAllowed("signup");
    const results = await Promise.all(Array.from({ length: allowed + 3 }, () => takeAttempt("signup", "")));
    expect(results.filter((r) => r.allowed).length).toBeLessThanOrEqual(allowed);
    expect(await takeAttempt("signup", "")).toMatchObject({ allowed: false });

    clientIp = "198.51.100.2";
    expect(await takeAttempt("signup", "")).toEqual({ allowed: true });
  });

  it("counts a link's sign-ups from every address together", async () => {
    const allowed = attemptsAllowed("join-link");
    for (let i = 0; i < allowed; i++) {
      clientIp = `192.0.2.${i}`;
      expect(await takeAttempt("join-link", "link-1")).toEqual({ allowed: true });
    }
    clientIp = "192.0.2.250";
    expect(await takeAttempt("join-link", "link-1")).toMatchObject({ allowed: false });
    expect(await takeAttempt("join-link", "link-2")).toEqual({ allowed: true });
  });
});

describe("the super admin", () => {
  it("is one person: the database refuses a second", async () => {
    await prisma.user.create({ data: { email: "boss@test.dk", name: "Boss", passwordHash: "x", role: "SUPER_ADMIN" } });
    await expect(
      prisma.user.create({ data: { email: "boss2@test.dk", name: "Boss 2", passwordHash: "x", role: "SUPER_ADMIN" } }),
    ).rejects.toThrow();
    await prisma.user.create({ data: { email: "ok@test.dk", name: "Almindelig", passwordHash: "x" } });
    expect(await prisma.user.count({ where: { role: "SUPER_ADMIN" } })).toBe(1);
  });
});
