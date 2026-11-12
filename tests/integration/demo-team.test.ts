import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { balances } from "@/lib/money";
import { DEMO_EMAIL_DOMAIN, DEMO_TEAM_NAME, createDemoTeam, removeDemoTeam } from "@/lib/demo-team";
import { createDemoTeamAction, removeDemoTeamAction } from "@/app/actions/teams";
import { makeSquad, makeUser, signIn } from "../helpers/factories";
import { expectRedirect } from "../helpers/expect";

describe("createDemoTeam", () => {
  it("makes a team with players, fines, activities, tasks, chat, posts and polls", async () => {
    const team = await createDemoTeam({ password: "demo-password" });
    expect(team.name).toBe(DEMO_TEAM_NAME);
    expect(await prisma.teamMember.count({ where: { teamId: team.id } })).toBe(8);
    expect(await prisma.teamMember.count({ where: { teamId: team.id, role: "ADMIN" } })).toBe(1);
    expect(await prisma.teamMember.count({ where: { teamId: team.id, role: "TREASURER" } })).toBe(1);
    // Seven fines given, and one more from the settled challenge.
    expect(await prisma.fine.count({ where: { teamId: team.id } })).toBe(8);
    expect(await prisma.challenge.groupBy({ by: ["status"], where: { teamId: team.id } })).toHaveLength(3);
    expect(await prisma.match.count({ where: { teamId: team.id } })).toBe(6);
    expect(await prisma.task.count({ where: { teamId: team.id } })).toBeGreaterThan(2);
    expect(await prisma.chatMessage.count({ where: { teamId: team.id } })).toBe(5);
    expect(await prisma.poll.count({ where: { teamId: team.id } })).toBe(2);

    const mads = await prisma.user.findUniqueOrThrow({ where: { email: `mads${DEMO_EMAIL_DOMAIN}` } });
    expect(await bcrypt.compare("demo-password", mads.passwordHash)).toBe(true);
  });

  it("gives the players a password nobody knows unless one is asked for", async () => {
    await createDemoTeam();
    const mads = await prisma.user.findUniqueOrThrow({ where: { email: `mads${DEMO_EMAIL_DOMAIN}` } });
    expect(await bcrypt.compare("demo-password", mads.passwordHash)).toBe(false);
  });

  it("keeps an anonymous poll's votes apart from who voted", async () => {
    const team = await createDemoTeam();
    const poll = await prisma.poll.findFirstOrThrow({ where: { teamId: team.id, anonymous: true } });
    expect(await prisma.pollVote.count({ where: { pollId: poll.id, voterId: { not: null } } })).toBe(0);
    expect(await prisma.pollBallot.count({ where: { pollId: poll.id } })).toBe(3);
  });

  it("is made afresh when made twice, and leaves other teams alone", async () => {
    const { team: real, anna } = await makeSquad();
    await createDemoTeam();
    const second = await createDemoTeam();
    expect(await prisma.team.findMany({ where: { name: DEMO_TEAM_NAME }, select: { id: true } })).toEqual([{ id: second.id }]);
    expect(await prisma.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } })).toBe(8);

    expect(await removeDemoTeam()).toEqual({ teams: 1, users: 8 });
    expect(await prisma.team.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: anna.id } })).not.toBeNull();
    expect(await prisma.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } })).toBe(0);
  });

  it("has accounts that add up: Lucas has paid his, Oliver owes 80 kr", async () => {
    const team = await createDemoTeam();
    const players = await prisma.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
    const fines = await prisma.fine.findMany({ where: { teamId: team.id } });
    const payments = await prisma.payment.findMany({ where: { teamId: team.id } });
    const owes = (first: string) =>
      balances(players.map((p) => p.id), fines, payments).find((b) => b.userId === players.find((p) => p.name.startsWith(first))!.id)!.owesKr;
    expect(owes("Lucas")).toBe(0);
    expect(owes("Oliver")).toBe(80);
  });
});

describe("the test team on /admin", () => {
  it("lets the super admin make it, as its admin, and take it away again", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    expect(await createDemoTeamAction()).toEqual({ ok: true, note: "Testholdet er oprettet, og du er admin på det." });
    const team = await prisma.team.findFirstOrThrow({ where: { name: DEMO_TEAM_NAME } });
    expect(await prisma.teamMember.findFirst({ where: { teamId: team.id, userId: root.id } })).toMatchObject({ role: "ADMIN" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: root.id } })).activeTeamId).toBe(team.id);

    expect(await removeDemoTeamAction()).toEqual({ ok: true, note: "Testholdet og dets spillere er slettet." });
    expect(await prisma.team.count({ where: { name: DEMO_TEAM_NAME } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: root.id } })).not.toBeNull();
    expect(await removeDemoTeamAction()).toEqual({ ok: true, note: "Der var intet testhold." });
  });

  it("is nobody else's: even a team's admin is sent away", async () => {
    const { admin } = await makeSquad();
    await createDemoTeam();
    await signIn(admin);
    await expectRedirect(() => createDemoTeamAction(), "/oversigt");
    await expectRedirect(() => removeDemoTeamAction(), "/oversigt");
    expect(await prisma.team.count({ where: { name: DEMO_TEAM_NAME } })).toBe(1);
  });
});
