import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { inviteCodeMatches } from "@/lib/invite-code";
import {
  createInvite,
  createTeam,
  deleteTeam,
  removeMember,
  revokeInvite,
  switchTeam,
  updateMember,
  updateTeam,
  visitTeam,
} from "@/app/actions/teams";
import { PHOTO_FIELD, formData, joinTeam, makeInvite, makeMember, makePhoto, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
import { expectDenied, expectRedirect } from "../helpers/expect";

const teamForm = (fields: Record<string, string> = {}) => formData({ name: "Swingkings", finePriceKr: "15", ...fields });

describe("updateTeam", () => {
  it("lets an admin rename, reprice, recolour and set the KampKlar link", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    const result = await updateTeam(
      undefined,
      teamForm({ name: "Swingkings II", theme: "GREEN", calendarUrl: "webcal://kampklar.dk/feed/abc.ics" }),
    );
    expect(result).toEqual({ ok: true });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({
      name: "Swingkings II",
      finePriceKr: 15,
      theme: "GREEN",
      calendarUrl: "https://kampklar.dk/feed/abc.ics",
    });
  });

  it("refuses a link that is not an address, and a price outside 1–1000", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    expect((await updateTeam(undefined, teamForm({ calendarUrl: "ikke et link" })))?.ok).toBe(false);
    expect(await updateTeam(undefined, teamForm({ finePriceKr: "0" }))).toEqual({
      ok: false,
      error: "Prisen for én bøde skal være et helt antal kroner (1–1000).",
    });
  });

  it("swaps the crest and throws the old picture away, and refuses another team's picture", async () => {
    const { team, admin } = await makeSquad();
    const other = await makeTeam("Andre");
    const old = await makePhoto(team.id);
    const next = await makePhoto(team.id);
    const foreign = await makePhoto(other.id);
    await prisma.team.update({ where: { id: team.id }, data: { photoId: old.id } });
    await signIn(admin);

    expect(await updateTeam(undefined, teamForm({ [PHOTO_FIELD]: foreign.id }))).toEqual({
      ok: false,
      error: "Billedet findes ikke længere.",
    });
    expect(await updateTeam(undefined, teamForm({ [PHOTO_FIELD]: next.id }))).toEqual({ ok: true });
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).photoId).toBe(next.id);
    expect(await prisma.photo.count({ where: { id: old.id } })).toBe(0);
  });

  it("is refused to a treasurer and a player", async () => {
    const { treasurer, anna } = await makeSquad();
    await signIn(treasurer);
    await expectDenied(() => updateTeam(undefined, teamForm()));
    await signIn(anna);
    await expectDenied(() => updateTeam(undefined, teamForm()));
  });
});

describe("invitations", () => {
  it("creates a hashed one-time code and shows it once", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    const result = await createInvite(undefined, formData({ email: " Ny@Test.dk ", role: "TREASURER" }));
    expect(result?.ok).toBe(true);
    const code = /Koden er (\S+)\./.exec((result as { note: string }).note)![1]!;
    const invite = await prisma.invite.findFirstOrThrow({ where: { teamId: team.id } });
    expect(invite).toMatchObject({ email: "ny@test.dk", role: "TREASURER", createdById: admin.id });
    expect(invite.codeHash).not.toContain(code.replace("-", ""));
    expect(inviteCodeMatches(code, invite.codeHash)).toBe(true);
  });

  it("refuses somebody already on the team, and a bad email", async () => {
    const { admin } = await makeSquad();
    const anna = await prisma.user.findFirstOrThrow({ where: { name: "Anna" } });
    await signIn(admin);
    expect(await createInvite(undefined, formData({ email: anna.email, role: "PLAYER" }))).toEqual({
      ok: false,
      error: "Den e-mail er allerede på holdet.",
    });
    expect(await createInvite(undefined, formData({ email: "nej", role: "PLAYER" }))).toEqual({ ok: false, error: "Skriv en gyldig e-mail." });
  });

  it("revokes only its own team's invitations", async () => {
    const { team, admin } = await makeSquad();
    const other = await makeSquad("Andre");
    const mine = await makeInvite({ teamId: team.id, email: "a@test.dk", createdById: admin.id });
    const theirs = await makeInvite({ teamId: other.team.id, email: "b@test.dk", createdById: other.admin.id });
    await signIn(admin);
    await revokeInvite(undefined, formData({ inviteId: theirs.invite.id }));
    await revokeInvite(undefined, formData({ inviteId: mine.invite.id }));
    expect(await prisma.invite.findMany({ select: { id: true } })).toEqual([{ id: theirs.invite.id }]);
  });

  it("is admin-only", async () => {
    const { treasurer } = await makeSquad();
    await signIn(treasurer);
    await expectDenied(() => createInvite(undefined, formData({ email: "x@test.dk", role: "PLAYER" })));
    await expectDenied(() => revokeInvite(undefined, formData({ inviteId: "x" })));
  });
});

describe("members", () => {
  it("changes role, shirt number and whether they take jobs", async () => {
    const { team, admin, anna } = await makeSquad();
    await signIn(admin);
    const result = await updateMember(
      undefined,
      formData({ userId: anna.id, role: "TREASURER", shirtNumber: "7", takesTasks: ["off"] }),
    );
    expect(result).toEqual({ ok: true });
    expect(await prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } })).toMatchObject({
      role: "TREASURER",
      shirtNumber: 7,
      takesTasks: false,
    });
    await updateMember(undefined, formData({ userId: anna.id, role: "PLAYER", shirtNumber: "", takesTasks: ["off", "on"] }));
    expect(await prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } })).toMatchObject({
      shirtNumber: null,
      takesTasks: true,
    });
  });

  it("refuses a shirt number that is not a number", async () => {
    const { admin, anna } = await makeSquad();
    await signIn(admin);
    expect(await updateMember(undefined, formData({ userId: anna.id, role: "PLAYER", shirtNumber: "ti" }))).toEqual({
      ok: false,
      error: "Trøjenummeret skal være et tal.",
    });
  });

  it("never leaves a team without an admin", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    const lastAdmin = { ok: false, error: "Holdet skal have mindst én træner/holdleder." };
    expect(await updateMember(undefined, formData({ userId: admin.id, role: "PLAYER" }))).toEqual(lastAdmin);
    expect(await removeMember(undefined, formData({ userId: admin.id }))).toEqual(lastAdmin);
  });

  it("cannot reach somebody on another team", async () => {
    const { admin } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(admin);
    expect(await updateMember(undefined, formData({ userId: other.anna.id, role: "ADMIN" }))).toEqual({
      ok: false,
      error: "Spilleren er ikke på holdet længere.",
    });
    await removeMember(undefined, formData({ userId: other.anna.id }));
    expect(await prisma.teamMember.count({ where: { teamId: other.team.id } })).toBe(4);
  });

  it("removes the membership and frees their open jobs, keeping fines and finished jobs", async () => {
    const { team, admin, anna } = await makeSquad();
    const open = await prisma.task.create({
      data: { teamId: team.id, title: "Tøjvask", dueAt: new Date(), assignees: { create: { userId: anna.id } } },
    });
    const done = await prisma.task.create({
      data: { teamId: team.id, title: "Kørsel", doneAt: new Date(), assignees: { create: { userId: anna.id } } },
    });
    await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "For sent", units: 1, unitPriceKr: 10, issuedById: admin.id } });
    await signIn(admin);

    expect(await removeMember(undefined, formData({ userId: anna.id }))).toEqual({ ok: true });
    expect(await prisma.teamMember.count({ where: { userId: anna.id } })).toBe(0);
    expect(await prisma.taskAssignee.count({ where: { taskId: open.id } })).toBe(0);
    expect(await prisma.taskAssignee.count({ where: { taskId: done.id } })).toBe(1);
    expect(await prisma.fine.count({ where: { playerId: anna.id } })).toBe(1);
  });
});

describe("switching teams", () => {
  it("moves the team on screen to another of theirs, and nowhere else", async () => {
    const first = await makeTeam("Første");
    const second = await makeTeam("Anden");
    const stranger = await makeTeam("Fremmed");
    const anna = await makeMember(first.id, "Anna");
    await joinTeam(anna.id, second.id);
    await signIn(anna);

    await expectRedirect(() => switchTeam(second.id), "/oversigt");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: anna.id } })).activeTeamId).toBe(second.id);
    await expectRedirect(() => switchTeam(stranger.id), "/oversigt");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: anna.id } })).activeTeamId).toBe(second.id);
  });
});

describe("super admin", () => {
  it("creates a team with an invitation for its coach", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    const result = await createTeam(undefined, formData({ name: "Nyt hold", adminEmail: "Coach@Test.dk" }));
    expect(result?.ok).toBe(true);
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Nyt hold" } });
    const invite = await prisma.invite.findFirstOrThrow({ where: { teamId: team.id } });
    expect(invite).toMatchObject({ email: "coach@test.dk", role: "ADMIN" });
    const code = /koden (\S+)\.$/.exec((result as { note: string }).note)![1]!;
    expect(inviteCodeMatches(code, invite.codeHash)).toBe(true);
    expect(await prisma.teamMember.count({ where: { userId: root.id } })).toBe(0);
  });

  it("joins a team it creates without a coach, as its admin", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    await createTeam(undefined, formData({ name: "Nyt hold", adminEmail: "" }));
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Nyt hold" } });
    expect(await prisma.teamMember.findFirst({ where: { userId: root.id, teamId: team.id } })).toMatchObject({ role: "ADMIN" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: root.id } })).activeTeamId).toBe(team.id);
  });

  it("visits and deletes any team", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    const { team } = await makeSquad();
    await signIn(root);
    await expectRedirect(() => visitTeam(team.id), "/oversigt");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: root.id } })).activeTeamId).toBe(team.id);
    await deleteTeam(undefined, formData({ teamId: team.id }));
    expect(await prisma.team.count()).toBe(0);
  });

  it("is nobody else's: even a team's admin is sent away", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    await expectRedirect(() => createTeam(undefined, formData({ name: "X" })), "/oversigt");
    await expectRedirect(() => deleteTeam(undefined, formData({ teamId: team.id })), "/oversigt");
    await expectRedirect(() => visitTeam(team.id), "/oversigt");
    expect(await prisma.team.count()).toBe(1);
  });
});
