import { describe, expect, it } from "vitest";
import type { MemberRole, PlatformRole } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { canAdministerTeam, canDeleteFine, canManageFines } from "@/lib/access";

const TEAM = "team-1";

function person(role: MemberRole | null, platform: PlatformRole = "USER"): SessionUser {
  return {
    id: "me",
    email: "me@test.dk",
    name: "Mig",
    role: platform,
    photoId: null,
    teams: role ? [{ id: TEAM, name: "Swingkings", photoId: null, theme: "SWINGKINGS", role }] : [],
    teamId: TEAM,
    teamName: "Swingkings",
    teamPhotoId: null,
    teamTheme: "SWINGKINGS",
    teamRole: role,
  };
}

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
