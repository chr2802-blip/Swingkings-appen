import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireSuperAdmin, requireTeamUser, requireUser, signSession } from "@/lib/auth";
import { acceptInvite, login, logout } from "@/app/actions/auth";
import { TEST_PASSWORD, formData, joinTeam, makeInvite, makeMember, makeTeam, makeUser, signIn } from "../helpers/factories";
import { expectRedirect } from "../helpers/expect";
import { SESSION_COOKIE_NAME, cookieStore, hasSessionCookie, setClientIp } from "../helpers/next-mocks";

const attempt = (email: string, password: string) => login(undefined, formData({ email, password }));

describe("login", () => {
  it("signs in with the right password and lands on the overview", async () => {
    const team = await makeTeam();
    const anna = await makeMember(team.id, "Anna", "PLAYER", { email: "anna@test.dk" });
    await expectRedirect(() => attempt("anna@test.dk", TEST_PASSWORD), "/oversigt");
    expect((await getCurrentUser())?.id).toBe(anna.id);
  });

  it("accepts the email in any casing", async () => {
    await makeUser({ email: "anna@test.dk" });
    await expectRedirect(() => attempt("ANNA@Test.dk", TEST_PASSWORD), "/oversigt");
  });

  it("refuses a wrong password, and an unknown email with the same words", async () => {
    await makeUser({ email: "anna@test.dk" });
    expect(await attempt("anna@test.dk", "forkert")).toEqual({ error: "Forkert e-mail eller adgangskode." });
    expect(await attempt("ingen@test.dk", TEST_PASSWORD)).toEqual({ error: "Forkert e-mail eller adgangskode." });
    expect(hasSessionCookie()).toBe(false);
  });

  it("lands a phone without the app on /hent-appen when the form says so, and nowhere else", async () => {
    await makeUser({ email: "anna@test.dk" });
    const withNext = (next: string) => login(undefined, formData({ email: "anna@test.dk", password: TEST_PASSWORD, next }));
    await expectRedirect(() => withNext("/hent-appen"), "/hent-appen");
    for (const next of ["https://evil.example/", "//evil.example", "/admin", "/oversigt"]) {
      await expectRedirect(() => withNext(next), "/oversigt");
    }
  });

  it("rejects a malformed email before counting anything", async () => {
    expect(await attempt("ikke-en-mail", "x")).toEqual({ error: "Skriv din e-mail og din adgangskode." });
    expect(await prisma.loginAttempt.count()).toBe(0);
  });

  it("locks out after eight failures, even with the right password, but only for that client", async () => {
    await makeUser({ email: "anna@test.dk" });
    for (let i = 0; i < 8; i++) await attempt("anna@test.dk", "forkert");
    const locked = await attempt("anna@test.dk", TEST_PASSWORD);
    expect(locked?.error).toMatch(/^For mange forsøg\. Prøv igen om \d+ min\.$/);

    setClientIp("198.51.100.7");
    await expectRedirect(() => attempt("anna@test.dk", TEST_PASSWORD), "/oversigt");
  });

  it("forgets the failures once somebody gets in", async () => {
    await makeUser({ email: "anna@test.dk" });
    for (let i = 0; i < 3; i++) await attempt("anna@test.dk", "forkert");
    await expectRedirect(() => attempt("anna@test.dk", TEST_PASSWORD), "/oversigt");
    expect(await prisma.loginAttempt.count()).toBe(0);
  });

  it("logs out by clearing the cookie", async () => {
    const user = await makeUser();
    await signIn(user);
    await expectRedirect(() => logout(), "/login");
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("the session", () => {
  it("is dead once the password version moves on", async () => {
    const user = await makeUser();
    await signIn(user);
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("is refused when the cookie is not one we signed", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "not.a.jwt");
    expect(await getCurrentUser()).toBeNull();
  });

  it("is refused for an account that no longer exists", async () => {
    const user = await makeUser();
    await signIn(user);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("reads an older cookie without a version claim as version 0", async () => {
    const user = await makeUser();
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sub: user.id })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    cookieStore.set(SESSION_COOKIE_NAME, token);
    expect((await getCurrentUser())?.id).toBe(user.id);
    expect(typeof (await signSession(user.id, 0))).toBe("string");
  });

  it("shows the stored team only while it is still one of theirs", async () => {
    const first = await makeTeam("Første");
    const second = await makeTeam("Anden");
    const stranger = await makeTeam("Fremmed");
    const anna = await makeMember(first.id, "Anna");
    await joinTeam(anna.id, second.id, "TREASURER");
    await prisma.user.update({ where: { id: anna.id }, data: { activeTeamId: second.id } });
    await signIn(anna);
    expect(await getCurrentUser()).toMatchObject({ teamId: second.id, teamRole: "TREASURER", teamName: "Anden" });

    await prisma.user.update({ where: { id: anna.id }, data: { activeTeamId: stranger.id } });
    expect(await getCurrentUser()).toMatchObject({ teamId: first.id, teamRole: "PLAYER" });
  });

  it("lets a super admin look at any team without a role there", async () => {
    const team = await makeTeam("Fremmed");
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    await prisma.user.update({ where: { id: admin.id }, data: { activeTeamId: team.id } });
    await signIn(admin);
    expect(await getCurrentUser()).toMatchObject({ teamId: team.id, teamRole: null, teams: [] });
  });

  it("sends nobody to login, the teamless to the team list, and players away from admin", async () => {
    await expectRedirect(() => requireUser(), "/login");
    const loner = await makeUser();
    await signIn(loner);
    await expectRedirect(() => requireTeamUser(), "/hold/vaelg");
    await expectRedirect(() => requireSuperAdmin(), "/oversigt");
  });
});

describe("acceptInvite", () => {
  async function invited(email = "ny@test.dk", role: "PLAYER" | "ADMIN" | "TREASURER" = "PLAYER") {
    const team = await makeTeam();
    const admin = await makeMember(team.id, "Træner", "ADMIN");
    const { invite, code } = await makeInvite({ teamId: team.id, email, createdById: admin.id, role });
    return { team, admin, invite, code };
  }

  const accept = (fields: Record<string, string>) =>
    acceptInvite(undefined, formData({ name: "Ny Spiller", password: "langt-nok-kodeord", ...fields }));

  it("creates an account, joins the team with the invited role and signs in", async () => {
    const { team, invite, code } = await invited("ny@test.dk", "TREASURER");
    await expectRedirect(() => accept({ email: "NY@test.dk", code: code.toLowerCase() }), "/oversigt");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ny@test.dk" }, include: { memberships: true } });
    expect(user.memberships).toMatchObject([{ teamId: team.id, role: "TREASURER" }]);
    expect(user.activeTeamId).toBe(team.id);
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).not.toBeNull();
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("lets somebody with an account join with their existing password, and only that", async () => {
    const existing = await makeUser({ email: "ny@test.dk" });
    const { team, code } = await invited();
    expect(await accept({ email: "ny@test.dk", code, password: "et-andet-kodeord" })).toEqual({
      error: "Du har allerede en konto. Skriv din nuværende adgangskode.",
    });
    await expectRedirect(() => accept({ email: "ny@test.dk", code, password: TEST_PASSWORD }), "/oversigt");
    expect(await prisma.teamMember.count({ where: { userId: existing.id, teamId: team.id } })).toBe(1);
    expect(await prisma.user.count({ where: { email: "ny@test.dk" } })).toBe(1);
  });

  it("refuses a wrong code, another email, an expired or a used invitation", async () => {
    const { team, admin, code } = await invited();
    const none = { error: "Der er ingen gyldig invitation med den e-mail og kode." };
    expect(await accept({ email: "ny@test.dk", code: "AAAA-AAAA" })).toEqual(none);
    expect(await accept({ email: "anden@test.dk", code })).toEqual(none);

    const expired = await makeInvite({ teamId: team.id, email: "gammel@test.dk", createdById: admin.id, expiresAt: new Date(Date.now() - 1000) });
    expect(await accept({ email: "gammel@test.dk", code: expired.code })).toEqual(none);
    const used = await makeInvite({ teamId: team.id, email: "brugt@test.dk", createdById: admin.id, acceptedAt: new Date() });
    expect(await accept({ email: "brugt@test.dk", code: used.code })).toEqual(none);
    expect(await prisma.user.count()).toBe(1);
  });

  it("sends a phone without the app to /hent-appen after joining, and only there", async () => {
    const { code } = await invited();
    await expectRedirect(() => accept({ email: "ny@test.dk", code, next: "/hent-appen" }), "/hent-appen");
    const second = await invited("to@test.dk");
    await expectRedirect(() => accept({ email: "to@test.dk", code: second.code, next: "https://evil.example" }), "/oversigt");
  });

  it("says which field is missing", async () => {
    expect(await accept({ email: "ny@test.dk", code: "" })).toEqual({ error: "Skriv koden fra invitationen." });
    expect(await accept({ email: "ny@test.dk", code: "X", password: "kort" })).toEqual({
      error: "Adgangskoden skal være mindst 8 tegn.",
    });
  });

  it("is throttled like login", async () => {
    await invited();
    for (let i = 0; i < 8; i++) await accept({ email: "ny@test.dk", code: "AAAA-AAAA" });
    expect((await accept({ email: "ny@test.dk", code: "AAAA-AAAA" }))?.error).toMatch(/^For mange forsøg/);
  });
});
