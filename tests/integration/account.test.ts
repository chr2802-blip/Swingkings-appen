import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { TEMPORARY_PASSWORD_LENGTH, deletionBlocker, generateTemporaryPassword } from "@/lib/account";
import { resetMemberPassword } from "@/app/actions/teams";
import { deleteMyAccount, setNewPassword, changePassword } from "@/app/actions/profile";
import { login } from "@/app/actions/auth";
import { TEST_PASSWORD, formData, joinTeam, makeMember, makePhoto, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
import { cookieStore, SESSION_COOKIE_NAME } from "../helpers/next-mocks";
import { expectDenied, expectRedirect, expectRedirectToLogin } from "../helpers/expect";

const fine = (teamId: string, playerId: string, issuedById: string, units = 2) =>
  prisma.fine.create({ data: { teamId, playerId, issuedById, reason: "For sent", units, unitPriceKr: 10 } });

describe("generateTemporaryPassword", () => {
  it("is long enough, unambiguous and different each time", () => {
    const passwords = Array.from({ length: 50 }, generateTemporaryPassword);
    for (const p of passwords) {
      expect(p).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(p).toMatch(/^[a-km-np-z2-9]+$/);
    }
    expect(new Set(passwords).size).toBe(50);
  });
});

describe("resetMemberPassword", () => {
  it("gives a temporary password, ends their sessions and makes the next login choose a new one", async () => {
    const { admin, anna } = await makeSquad();
    await signIn(anna);
    const annasCookie = cookieStore.get(SESSION_COOKIE_NAME)!;

    await signIn(admin);
    const result = await resetMemberPassword(undefined, formData({ userId: anna.id }));
    expect(result?.ok).toBe(true);
    const password = result?.ok ? result.note! : "";
    expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: anna.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(password, row.passwordHash)).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, row.passwordHash)).toBe(false);

    cookieStore.set(SESSION_COOKIE_NAME, annasCookie);
    expect(await getCurrentUser()).toBeNull();

    await expectRedirect(() => login(undefined, formData({ email: anna.email, password })), "/ny-adgangskode");
    expect((await getCurrentUser())?.mustChangePassword).toBe(true);
  });

  it("is for admins only", async () => {
    const { treasurer, anna, bo } = await makeSquad();
    for (const who of [treasurer, anna]) {
      await signIn(who);
      await expectDenied(() => resetMemberPassword(undefined, formData({ userId: bo.id })));
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bo.id } })).mustChangePassword).toBe(false);
  });

  it("does not reach another team's member, oneself or the super admin", async () => {
    const { team, admin } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(admin);
    expect(await resetMemberPassword(undefined, formData({ userId: other.anna.id }))).toEqual({ ok: false, error: "Personen er ikke på holdet." });
    expect(await resetMemberPassword(undefined, formData({ userId: admin.id }))).toEqual({
      ok: false,
      error: "Skift din egen adgangskode under Profil.",
    });

    const boss = await makeUser({ name: "Boss", role: "SUPER_ADMIN" });
    await joinTeam(boss.id, team.id);
    expect(await resetMemberPassword(undefined, formData({ userId: boss.id }))).toEqual({
      ok: false,
      error: "Super admins adgangskode kan ikke nulstilles her.",
    });
  });

  it("refuses a member who is also on a team the admin does not run", async () => {
    const { admin, anna } = await makeSquad();
    const other = await makeTeam("Andre");
    await joinTeam(anna.id, other.id);
    await signIn(admin);
    expect(await resetMemberPassword(undefined, formData({ userId: anna.id }))).toEqual({
      ok: false,
      error: "Anna er også på et hold, du ikke er admin på. Bed super admin om at nulstille den.",
    });

    // An admin on both teams may.
    await joinTeam(admin.id, other.id, "ADMIN");
    await signIn(admin);
    expect((await resetMemberPassword(undefined, formData({ userId: anna.id })))?.ok).toBe(true);
  });

  it("is open to the super admin across teams", async () => {
    const { team, anna } = await makeSquad();
    await joinTeam(anna.id, (await makeTeam("Andre")).id);
    const boss = await makeUser({ name: "Boss", role: "SUPER_ADMIN" });
    await prisma.user.update({ where: { id: boss.id }, data: { activeTeamId: team.id } });
    await signIn(boss);
    expect((await resetMemberPassword(undefined, formData({ userId: anna.id })))?.ok).toBe(true);
  });
});

describe("setNewPassword", () => {
  it("replaces the temporary password and lets them in", async () => {
    const { team } = await makeSquad();
    const anna = await makeMember(team.id, "Anna2");
    await prisma.user.update({ where: { id: anna.id }, data: { mustChangePassword: true } });
    await signIn(anna);

    expect(await setNewPassword(undefined, formData({ next: "kort" }))).toEqual({
      ok: false,
      error: "Adgangskoden skal være mindst 8 tegn.",
    });
    await expectRedirect(() => setNewPassword(undefined, formData({ next: "min-egen-kode" })), "/oversigt");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: anna.id } });
    expect(row.mustChangePassword).toBe(false);
    expect(await verifyPassword("min-egen-kode", row.passwordHash)).toBe(true);
    expect((await getCurrentUser())?.id).toBe(anna.id);
  });

  it("is only for somebody with a temporary password", async () => {
    const user = await makeUser();
    await signIn(user);
    expect(await setNewPassword(undefined, formData({ next: "min-egen-kode" }))).toEqual({
      ok: false,
      error: "Skift din adgangskode under Profil.",
    });
  });

  it("is also cleared by changing the password the ordinary way", async () => {
    const user = await makeUser();
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    await signIn(user);
    await changePassword(undefined, formData({ current: TEST_PASSWORD, next: "min-egen-kode" }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => setNewPassword(undefined, formData({ next: "min-egen-kode" })));
  });
});

describe("deleteMyAccount", () => {
  it("deletes the account and what is theirs, and leaves the fines they gave standing", async () => {
    const { team, anna, bo } = await makeSquad();
    const given = await fine(team.id, bo.id, anna.id);
    const [profilePhoto, chatPhoto, postPhoto] = await Promise.all([makePhoto(team.id), makePhoto(team.id), makePhoto(team.id)]);
    await prisma.user.update({ where: { id: anna.id }, data: { photoId: profilePhoto.id } });
    await prisma.chatMessage.create({
      data: { teamId: team.id, authorId: anna.id, body: "Hej", photos: { create: { photoId: chatPhoto.id, position: 0 } } },
    });
    await prisma.post.create({
      data: { teamId: team.id, authorId: anna.id, body: "Kamp", photos: { create: { photoId: postPhoto.id, position: 0 } } },
    });
    await signIn(anna);

    await expectRedirect(() => deleteMyAccount(undefined, formData({ password: TEST_PASSWORD })), "/login?slettet=1");

    expect(await prisma.user.findUnique({ where: { id: anna.id } })).toBeNull();
    expect(await prisma.teamMember.count({ where: { userId: anna.id } })).toBe(0);
    expect(await prisma.chatMessage.count({ where: { teamId: team.id } })).toBe(0);
    expect(await prisma.post.count({ where: { teamId: team.id } })).toBe(0);
    expect(await prisma.photo.count({ where: { id: { in: [profilePhoto.id, chatPhoto.id, postPhoto.id] } } })).toBe(0);
    expect(await prisma.fine.findUniqueOrThrow({ where: { id: given.id } })).toMatchObject({ playerId: bo.id, issuedById: null });
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("asks for the password", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    expect(await deleteMyAccount(undefined, formData({}))).toEqual({ ok: false, error: "Skriv din adgangskode." });
    expect(await deleteMyAccount(undefined, formData({ password: "forkert" }))).toEqual({ ok: false, error: "Adgangskoden er forkert." });
    expect(await prisma.user.findUnique({ where: { id: anna.id } })).not.toBeNull();
  });

  it("is refused while fines are owed, also on a team they have left, until they are marked paid", async () => {
    const { team, treasurer, anna } = await makeSquad();
    await fine(team.id, anna.id, treasurer.id, 3);
    await signIn(anna);
    const owes = { ok: false, error: "Du skylder 30 kr i bøder på Swingkings. Kontoen kan slettes, når de er betalt." };
    expect(await deleteMyAccount(undefined, formData({ password: TEST_PASSWORD }))).toEqual(owes);

    await prisma.teamMember.update({ where: { userId_teamId: { userId: anna.id, teamId: team.id } }, data: { finesPaidAt: new Date() } });
    expect(await deletionBlocker(anna.id)).toBeNull();

    await prisma.teamMember.delete({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } });
    expect(await deleteMyAccount(undefined, formData({ password: TEST_PASSWORD }))).toEqual(owes);
  });

  it("counts a won challenge against what is owed", async () => {
    const { team, treasurer, anna } = await makeSquad();
    await fine(team.id, anna.id, treasurer.id, 2);
    await fine(team.id, anna.id, treasurer.id, -2);
    expect(await deletionBlocker(anna.id)).toBeNull();
  });

  it("is refused for a team's last admin while others are on it, and for the super admin", async () => {
    const { admin } = await makeSquad();
    await signIn(admin);
    expect(await deleteMyAccount(undefined, formData({ password: TEST_PASSWORD }))).toEqual({
      ok: false,
      error: "Du er den eneste admin på Swingkings. Gør en anden til admin først.",
    });

    const alone = await makeMember((await makeTeam("Alene")).id, "Solo", "ADMIN");
    expect(await deletionBlocker(alone.id)).toBeNull();

    const boss = await makeUser({ name: "Boss", role: "SUPER_ADMIN" });
    expect(await deletionBlocker(boss.id)).toBe("Super admin kan ikke slette sin konto.");
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => deleteMyAccount(undefined, formData({ password: TEST_PASSWORD })));
  });
});
