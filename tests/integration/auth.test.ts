import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireSuperAdmin, requireTeamUser, requireUser, signSession } from "@/lib/auth";
import { joinWithLink, joinWithLinkAsMe, login, logout } from "@/app/actions/auth";
import { TEST_PASSWORD, formData, joinTeam, makeInviteLink, makeMember, makeTeam, makeUser, signIn } from "../helpers/factories";
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

describe("joining with an invitation link", () => {
  async function linked(options: { maxUses?: number; uses?: number; expiresAt?: Date } = {}) {
    const team = await makeTeam();
    const admin = await makeMember(team.id, "Træner", "ADMIN");
    const { link, token } = await makeInviteLink({ teamId: team.id, createdById: admin.id, ...options });
    return { team, admin, link, token };
  }

  const join = (fields: Record<string, string>) =>
    joinWithLink(undefined, formData({ name: "Ny Spiller", password: "langt-nok-kodeord", ...fields }));

  it("makes an account, joins the team as a player, counts the place and signs in", async () => {
    const { team, link, token } = await linked();
    await expectRedirect(() => join({ token, email: " NY@test.dk " }), "/oversigt");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ny@test.dk" }, include: { memberships: true } });
    expect(user.memberships).toMatchObject([{ teamId: team.id, role: "PLAYER" }]);
    expect(user.activeTeamId).toBe(team.id);
    expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(1);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("lets somebody with an account join with their existing password, and only that", async () => {
    const existing = await makeUser({ email: "ny@test.dk" });
    const { team, token } = await linked();
    expect(await join({ token, email: "ny@test.dk", password: "et-andet-kodeord" })).toEqual({
      error: "Der findes allerede en konto med den e-mail. Skriv din nuværende adgangskode.",
    });
    await expectRedirect(() => join({ token, email: "ny@test.dk", password: TEST_PASSWORD }), "/oversigt");
    expect(await prisma.teamMember.count({ where: { userId: existing.id, teamId: team.id } })).toBe(1);
    expect(await prisma.user.count({ where: { email: "ny@test.dk" } })).toBe(1);
  });

  it("refuses an unknown, an expired and a used-up link, and makes no account", async () => {
    expect(await join({ token: "findes-ikke", email: "a@test.dk" })).toEqual({
      error: "Linket virker ikke. Måske er det trukket tilbage — bed træneren om et nyt.",
    });
    const expired = await linked({ expiresAt: new Date(Date.now() - 1000) });
    expect(await join({ token: expired.token, email: "b@test.dk" })).toEqual({ error: "Linket er udløbet. Bed træneren om et nyt." });
    const full = await linked({ maxUses: 2, uses: 2 });
    expect(await join({ token: full.token, email: "c@test.dk" })).toEqual({ error: "Linket er brugt op. Bed træneren om et nyt." });
    expect(await prisma.user.count({ where: { email: { in: ["a@test.dk", "b@test.dk", "c@test.dk"] } } })).toBe(0);
  });

  it("says which field is missing", async () => {
    const { token } = await linked();
    expect(await join({ token: "", email: "ny@test.dk" })).toEqual({ error: "Linket mangler. Åbn det igen fra beskeden." });
    expect(await join({ token, email: "ikke-en-mail" })).toEqual({ error: "Skriv en gyldig e-mail." });
    expect(await join({ token, email: "ny@test.dk", password: "kort" })).toEqual({ error: "Adgangskoden skal være mindst 8 tegn." });
  });

  it("sends a phone without the app to /hent-appen after joining, and only there", async () => {
    const { token } = await linked();
    await expectRedirect(() => join({ token, email: "ny@test.dk", next: "/hent-appen" }), "/hent-appen");
    const second = await linked();
    await expectRedirect(() => join({ token: second.token, email: "to@test.dk", next: "https://evil.example" }), "/oversigt");
  });

  it("throttles wrong passwords for an existing account like login", async () => {
    await makeUser({ email: "ny@test.dk" });
    const { token } = await linked();
    for (let i = 0; i < 8; i++) await join({ token, email: "ny@test.dk", password: "forkert-kodeord" });
    expect((await join({ token, email: "ny@test.dk", password: TEST_PASSWORD }))?.error).toMatch(/^For mange forsøg/);
  });

  it("lets somebody already signed in join with one press", async () => {
    const { team, token } = await linked();
    const loner = await makeUser();
    await signIn(loner);
    await expectRedirect(() => joinWithLinkAsMe(undefined, formData({ token })), "/oversigt");
    expect(await prisma.teamMember.findFirst({ where: { userId: loner.id, teamId: team.id } })).toMatchObject({ role: "PLAYER" });
    expect(await joinWithLinkAsMe(undefined, formData({ token: "findes-ikke" }))).toEqual({
      error: "Linket virker ikke. Måske er det trukket tilbage — bed træneren om et nyt.",
    });
  });
});
