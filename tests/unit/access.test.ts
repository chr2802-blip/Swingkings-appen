import { describe, expect, it } from "vitest";
import type { MemberRole } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import {
  ROLE_LABEL,
  assertFineManager,
  assertTeamAccess,
  assertTeamAdmin,
  canAccessTeam,
  canAdministerTeam,
  canManageFines,
} from "@/lib/access";
import { NOT_ALLOWED_DIGEST, NotAllowedError, isNotAllowed } from "@/lib/not-allowed";

function user(teams: [string, MemberRole][], role: "USER" | "SUPER_ADMIN" = "USER"): SessionUser {
  return {
    id: "u",
    email: "u@test.dk",
    name: "U",
    role,
    photoId: null,
    teams: teams.map(([id, teamRole]) => ({ id, name: id, photoId: null, theme: "SWINGKINGS", role: teamRole })),
    teamId: teams[0]?.[0] ?? null,
    teamName: null,
    teamPhotoId: null,
    teamTheme: "SWINGKINGS",
    teamRole: teams[0]?.[1] ?? null,
  };
}

describe("permissions are asked per team", () => {
  const treasurerHerePlayerThere = user([
    ["a", "TREASURER"],
    ["b", "PLAYER"],
  ]);

  it("lets a treasurer manage fines on their own team only", () => {
    expect(canManageFines(treasurerHerePlayerThere, "a")).toBe(true);
    expect(canManageFines(treasurerHerePlayerThere, "b")).toBe(false);
    expect(canAdministerTeam(treasurerHerePlayerThere, "a")).toBe(false);
  });

  it("gives an admin everything on their team and nothing on a stranger's", () => {
    const admin = user([["a", "ADMIN"]]);
    expect([canAccessTeam(admin, "a"), canAdministerTeam(admin, "a"), canManageFines(admin, "a")]).toEqual([true, true, true]);
    expect([canAccessTeam(admin, "z"), canAdministerTeam(admin, "z"), canManageFines(admin, "z")]).toEqual([false, false, false]);
  });

  it("gives a super admin everything everywhere", () => {
    const root = user([], "SUPER_ADMIN");
    expect([canAccessTeam(root, "z"), canAdministerTeam(root, "z"), canManageFines(root, "z")]).toEqual([true, true, true]);
  });

  it("throws the not-allowed error the error page recognises", () => {
    const player = user([["a", "PLAYER"]]);
    expect(() => assertTeamAccess(player, "a")).not.toThrow();
    for (const assert of [() => assertTeamAccess(player, "z"), () => assertTeamAdmin(player, "a"), () => assertFineManager(player, "a")]) {
      let caught: unknown;
      try {
        assert();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotAllowedError);
      expect(isNotAllowed(caught)).toBe(true);
    }
  });

  it("labels every role in Danish", () => {
    expect(ROLE_LABEL).toEqual({ ADMIN: "Træner/holdleder", TREASURER: "Kasserer", PLAYER: "Spiller" });
  });
});

describe("isNotAllowed", () => {
  it("reads the digest, which survives Next replacing the message", () => {
    expect(isNotAllowed({ digest: NOT_ALLOWED_DIGEST })).toBe(true);
    expect(isNotAllowed(new Error("Not allowed"))).toBe(false);
    expect(isNotAllowed(null)).toBe(false);
    expect(isNotAllowed("SWINGKINGS_NOT_ALLOWED")).toBe(false);
  });
});
