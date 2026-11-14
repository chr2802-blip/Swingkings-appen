import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { findInviteLink } from "@/lib/invite-links";
import { DEFAULT_LINK_DAYS, DEFAULT_LINK_MAX_USES, LINK_DAYS, LINK_MAX_USES } from "@/lib/invite-link-options";
import {
  createInviteLink,
  createTeam,
  deleteTeam,
  removeMember,
  revokeInviteLink,
  setMemberDues,
  setMemberRole,
  switchTeam,
  updateMember,
  updateTeam,
  visitTeam,
} from "@/app/actions/teams";
import { PHOTO_FIELD, formData, joinTeam, makeInviteLink, makeMember, makePhoto, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
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

  it("keeps the box's pay-in link without its query, and what kontingent costs, and clears both", async () => {
    const { team, admin } = await makeSquad();
    const link = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";
    const saved = () => prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    await signIn(admin);
    expect(await updateTeam(undefined, teamForm({ mobilePayLink: `${link}?amount=3000&message=x`, duesKr: "600" }))).toEqual({ ok: true });
    expect(await saved()).toMatchObject({ mobilePayLink: link, duesKr: 600 });
    // A form without the fields leaves them be.
    await updateTeam(undefined, teamForm());
    expect(await saved()).toMatchObject({ mobilePayLink: link, duesKr: 600 });
    await updateTeam(undefined, teamForm({ mobilePayLink: "", duesKr: "" }));
    expect(await saved()).toMatchObject({ mobilePayLink: null, duesKr: null });
  });

  it("refuses a link that is not the box's own, and a kontingent that is not whole kroner", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    expect(await updateTeam(undefined, teamForm({ mobilePayLink: "https://example.com/box/x/pay-in" }))).toEqual({
      ok: false,
      error: "Linket skal være boxens eget fra MobilePay: https://qr.mobilepay.dk/box/…/pay-in",
    });
    expect(await updateTeam(undefined, teamForm({ duesKr: "12.5" }))).toEqual({
      ok: false,
      error: "Kontingentet skal være et helt antal kroner.",
    });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ mobilePayLink: null, duesKr: null });
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

describe("invitation links", () => {
  it("makes a link with the chosen lifetime and number of places, shown once and stored hashed", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    const result = await createInviteLink(undefined, formData({ days: "14", maxUses: "5" }));
    expect(result?.ok).toBe(true);
    const path = (result as { note: string }).note;
    expect(path).toMatch(/^\/join\/[\w-]{40,}$/);
    const token = path.slice("/join/".length);

    const link = await prisma.inviteLink.findFirstOrThrow({ where: { teamId: team.id } });
    expect(link).toMatchObject({ maxUses: 5, uses: 0, createdById: admin.id });
    expect(link.tokenHash).not.toContain(token);
    expect((await findInviteLink(token))?.id).toBe(link.id);
    const days = (link.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it("offers the defaults among its choices", () => {
    expect(LINK_DAYS).toContain(DEFAULT_LINK_DAYS);
    expect(LINK_MAX_USES).toContain(DEFAULT_LINK_MAX_USES);
    expect(Math.max(...LINK_MAX_USES)).toBeLessThanOrEqual(50);
  });

  it("refuses a lifetime or a number of places that is not offered", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    expect(await createInviteLink(undefined, formData({ days: "365", maxUses: "5" }))).toEqual({ ok: false, error: "Vælg hvor længe linket gælder." });
    expect(await createInviteLink(undefined, formData({ days: "7", maxUses: "1000" }))).toEqual({
      ok: false,
      error: "Vælg hvor mange der kan bruge linket.",
    });
    expect(await prisma.inviteLink.count()).toBe(0);
  });

  it("revokes only its own team's links", async () => {
    const { team, admin } = await makeSquad();
    const other = await makeSquad("Andre");
    const mine = await makeInviteLink({ teamId: team.id, createdById: admin.id });
    const theirs = await makeInviteLink({ teamId: other.team.id, createdById: other.admin.id });
    await signIn(admin);
    await revokeInviteLink(undefined, formData({ linkId: theirs.link.id }));
    await revokeInviteLink(undefined, formData({ linkId: mine.link.id }));
    expect(await prisma.inviteLink.findMany({ select: { id: true } })).toEqual([{ id: theirs.link.id }]);
  });

  it("is admin-only", async () => {
    const { treasurer, anna } = await makeSquad();
    for (const who of [treasurer, anna]) {
      await signIn(who);
      await expectDenied(() => createInviteLink(undefined, formData({ days: "7", maxUses: "5" })));
      await expectDenied(() => revokeInviteLink(undefined, formData({ linkId: "x" })));
    }
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

  it("marks kontingent paid with the day it was paid, keeps that day, clears it, and leaves it alone when not asked", async () => {
    const { team, admin, anna } = await makeSquad();
    await signIn(admin);
    const dues = async () =>
      (await prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } })).duesPaidAt;

    await updateMember(undefined, formData({ userId: anna.id, role: "PLAYER", duesPaid: ["off", "on"] }));
    const paidAt = await dues();
    expect(paidAt).not.toBeNull();
    await updateMember(undefined, formData({ userId: anna.id, role: "PLAYER", duesPaid: ["off", "on"] }));
    expect(await dues()).toEqual(paidAt);
    // A form without the box (an older page) changes nothing.
    await updateMember(undefined, formData({ userId: anna.id, role: "PLAYER" }));
    expect(await dues()).toEqual(paidAt);
    await updateMember(undefined, formData({ userId: anna.id, role: "PLAYER", duesPaid: ["off"] }));
    expect(await dues()).toBeNull();
  });

  it("lets only an admin mark kontingent", async () => {
    const { team, treasurer, anna } = await makeSquad();
    for (const who of [treasurer, anna]) {
      await signIn(who);
      await expectDenied(() => updateMember(undefined, formData({ userId: anna.id, role: "PLAYER", duesPaid: ["off", "on"] })));
    }
    expect((await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).duesPaidAt).toBeNull();
  });

  it("keeps the role when the form does not carry one", async () => {
    const { team, admin, treasurer } = await makeSquad();
    await signIn(admin);
    expect(await updateMember(undefined, formData({ userId: treasurer.id, shirtNumber: "4", takesTasks: ["off", "on"] }))).toEqual({ ok: true });
    expect(await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: treasurer.id } })).toMatchObject({
      role: "TREASURER",
      shirtNumber: 4,
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
    const lastAdmin = { ok: false, error: "Holdet skal have mindst én admin." };
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

describe("the members table", () => {
  const membership = (teamId: string, userId: string) =>
    prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId, teamId } } });

  it("sets a member's place in the role stack, leaving shirt number and jobs alone", async () => {
    const { team, admin, anna } = await makeSquad();
    await prisma.teamMember.updateMany({ where: { teamId: team.id, userId: anna.id }, data: { shirtNumber: 9, takesTasks: false } });
    await signIn(admin);
    expect(await setMemberRole(undefined, formData({ userId: anna.id, role: "TREASURER" }))).toEqual({ ok: true });
    expect(await membership(team.id, anna.id)).toMatchObject({ role: "TREASURER", shirtNumber: 9, takesTasks: false });
    await setMemberRole(undefined, formData({ userId: anna.id, role: "ADMIN" }));
    expect((await membership(team.id, anna.id)).role).toBe("ADMIN");
    // With two admins, either may step down.
    expect(await setMemberRole(undefined, formData({ userId: admin.id, role: "TREASURER" }))).toEqual({ ok: true });
  });

  it("refuses a role that is not one, and never leaves the team without an admin", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    expect((await setMemberRole(undefined, formData({ userId: admin.id, role: "SUPER_ADMIN" })))?.ok).toBe(false);
    expect(await setMemberRole(undefined, formData({ userId: admin.id, role: "TREASURER" }))).toEqual({
      ok: false,
      error: "Holdet skal have mindst én admin.",
    });
    expect((await membership(team.id, admin.id)).role).toBe("ADMIN");
  });

  it("ticks kontingent with the day it was paid, keeps that day and clears it", async () => {
    const { team, admin, anna } = await makeSquad();
    await signIn(admin);
    expect(await setMemberDues(undefined, formData({ userId: anna.id, paid: "on" }))).toEqual({ ok: true });
    const paidAt = (await membership(team.id, anna.id)).duesPaidAt;
    expect(paidAt).not.toBeNull();
    await setMemberDues(undefined, formData({ userId: anna.id, paid: "on" }));
    expect((await membership(team.id, anna.id)).duesPaidAt).toEqual(paidAt);
    await setMemberDues(undefined, formData({ userId: anna.id, paid: "off" }));
    expect((await membership(team.id, anna.id)).duesPaidAt).toBeNull();
    expect((await setMemberDues(undefined, formData({ userId: anna.id, paid: "ja" })))?.ok).toBe(false);
  });

  it("lets only an admin tick roles and kontingent", async () => {
    const { team, treasurer, anna } = await makeSquad();
    for (const who of [treasurer, anna]) {
      await signIn(who);
      await expectDenied(() => setMemberRole(undefined, formData({ userId: anna.id, role: "ADMIN" })));
      await expectDenied(() => setMemberDues(undefined, formData({ userId: anna.id, paid: "on" })));
    }
    expect(await membership(team.id, anna.id)).toMatchObject({ role: "PLAYER", duesPaidAt: null });
  });

  it("cannot reach somebody on another team", async () => {
    const { admin } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(admin);
    const gone = { ok: false, error: "Spilleren er ikke på holdet længere." };
    expect(await setMemberRole(undefined, formData({ userId: other.anna.id, role: "ADMIN" }))).toEqual(gone);
    expect(await setMemberDues(undefined, formData({ userId: other.anna.id, paid: "on" }))).toEqual(gone);
    expect(await membership(other.team.id, other.anna.id)).toMatchObject({ role: "PLAYER", duesPaidAt: null });
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
  it("creates a team with a one-place link for its coach, and does not join it", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    const result = await createTeam(undefined, formData({ name: "Nyt hold", adminLink: "on" }));
    expect(result?.ok).toBe(true);
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Nyt hold" } });
    const token = (result as { note: string }).note.replace(/^\/join\//, "");
    expect(await findInviteLink(token)).toMatchObject({ teamId: team.id, maxUses: 1 });
    expect(await prisma.teamMember.count({ where: { userId: root.id } })).toBe(0);
  });

  it("joins a team it creates without a coach, as its admin", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    expect(await createTeam(undefined, formData({ name: "Nyt hold" }))).toEqual({ ok: true, note: "Nyt hold er oprettet, og du er træner på det." });
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
