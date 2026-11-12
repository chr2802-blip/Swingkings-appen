import { describe, expect, it } from "vitest";
import type { MemberRole } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { ROLE_DESCRIPTION, ROLE_LABEL, assertFineManager, assertTeamAccess, assertTeamAdmin, canAccessTeam } from "@/lib/access";
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

describe("the assertions", () => {
  it("let a member onto their own team only, and a super admin onto any", () => {
    expect(canAccessTeam(user([["a", "PLAYER"]]), "a")).toBe(true);
    expect(canAccessTeam(user([["a", "PLAYER"]]), "z")).toBe(false);
    expect(canAccessTeam(user([], "SUPER_ADMIN"), "z")).toBe(true);
  });

  it("throw the not-allowed error the error page recognises", () => {
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

  it("label and describe every role in Danish", () => {
    expect(ROLE_LABEL).toEqual({ ADMIN: "Admin", TREASURER: "Bødekasseformand", PLAYER: "Spiller" });
    expect(Object.keys(ROLE_DESCRIPTION).sort()).toEqual(["ADMIN", "PLAYER", "TREASURER"]);
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
