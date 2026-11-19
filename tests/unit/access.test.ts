import { describe, expect, it } from "vitest";
import type { MemberRole, PlatformRole } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { canAdministerClub, canAdministerTeam, canChangePost, canDeleteFine, canManageFines } from "@/lib/access";

const TEAM = "team-1";

function person(role: MemberRole | null, platform: PlatformRole = "USER", clubAdminOf: string[] = []): SessionUser {
  return {
    id: "me",
    email: "me@test.dk",
    name: "Mig",
    role: platform,
    photoId: null,
    mustChangePassword: false,
    teams: role ? [{ id: TEAM, name: "Swingkings", photoId: null, theme: "SWINGKINGS", role, clubId: "club-1" }] : [],
    clubAdminOf,
    teamId: TEAM,
    teamName: "Swingkings",
    teamPhotoId: null,
    teamTheme: "SWINGKINGS",
    teamRole: role,
  };
}

describe("clubs", () => {
  it("are looked after by their own club admins and the super admin, nobody else", () => {
    expect(canAdministerClub(person("PLAYER", "USER", ["club-1"]), "club-1")).toBe(true);
    expect(canAdministerClub(person("PLAYER", "USER", ["club-1"]), "club-2")).toBe(false);
    // A team admin is nothing in the club.
    expect(canAdministerClub(person("ADMIN"), "club-1")).toBe(false);
    expect(canAdministerClub(person(null, "SUPER_ADMIN"), "club-1")).toBe(true);
    expect(canAdministerClub(person(null, "SUPER_ADMIN"), null)).toBe(false);
  });

  it("let a club's admins change its posts, and a team's admins only the team's own", () => {
    const clubPost = { authorId: "someone", clubId: "club-1" };
    const teamPost = { authorId: "someone", clubId: null };
    expect(canChangePost(person("ADMIN"), TEAM, clubPost)).toBe(false);
    expect(canChangePost(person("PLAYER", "USER", ["club-1"]), TEAM, clubPost)).toBe(true);
    expect(canChangePost(person("ADMIN"), TEAM, teamPost)).toBe(true);
    expect(canChangePost(person("PLAYER", "USER", ["club-1"]), TEAM, teamPost)).toBe(false);
    expect(canChangePost(person("PLAYER"), TEAM, { authorId: "me", clubId: "club-1" })).toBe(true);
  });
});

describe("roles", () => {
  it("give the team's settings to admins and the super admin only", () => {
    expect(canAdministerTeam(person("ADMIN"), TEAM)).toBe(true);
    expect(canAdministerTeam(person("TREASURER"), TEAM)).toBe(false);
    expect(canAdministerTeam(person("PLAYER"), TEAM)).toBe(false);
    expect(canAdministerTeam(person(null, "SUPER_ADMIN"), TEAM)).toBe(true);
  });

  it("give the fine catalogue to the bødekasseformand and admins", () => {
    expect(canManageFines(person("TREASURER"), TEAM)).toBe(true);
    expect(canManageFines(person("ADMIN"), TEAM)).toBe(true);
    expect(canManageFines(person("PLAYER"), TEAM)).toBe(false);
    expect(canManageFines(person(null, "SUPER_ADMIN"), TEAM)).toBe(true);
  });

  it("are asked per team: a role on one team is nothing on the next", () => {
    expect(canAdministerTeam(person("ADMIN"), "another-team")).toBe(false);
    expect(canManageFines(person("TREASURER"), "another-team")).toBe(false);
  });

  it("let whoever gave a fine take it back, and otherwise only the fine managers", () => {
    expect(canDeleteFine(person("PLAYER"), TEAM, { issuedById: "me" })).toBe(true);
    expect(canDeleteFine(person("PLAYER"), TEAM, { issuedById: "someone-else" })).toBe(false);
    expect(canDeleteFine(person("TREASURER"), TEAM, { issuedById: "someone-else" })).toBe(true);
    expect(canDeleteFine(person("ADMIN"), TEAM, { issuedById: "someone-else" })).toBe(true);
  });
});
