import type { MemberRole } from "@prisma/client";
import type { SessionUser } from "./auth";
import { NotAllowedError } from "./not-allowed";

/**
 * Who may do what, answered per team: the treasurer of one team is an ordinary player on
 * the next. A super admin may do everything everywhere.
 *
 * Always asked of a team id — the one an action was given, or the record's own — never
 * of "the team on screen" alone, which is only where somebody happens to be looking.
 */
function roleOn(user: SessionUser, teamId: string): MemberRole | null {
  return user.teams.find((team) => team.id === teamId)?.role ?? null;
}

export function canAccessTeam(user: SessionUser, teamId: string) {
  return user.role === "SUPER_ADMIN" || roleOn(user, teamId) !== null;
}

/** Træner/holdleder: members, invitations, matches, the calendar link, settings. */
export function canAdministerTeam(user: SessionUser, teamId: string) {
  return user.role === "SUPER_ADMIN" || roleOn(user, teamId) === "ADMIN";
}

/** Kasserer/bødeformand, and every admin: the catalogue, fines and payments. */
export function canManageFines(user: SessionUser, teamId: string) {
  if (user.role === "SUPER_ADMIN") return true;
  const role = roleOn(user, teamId);
  return role === "ADMIN" || role === "TREASURER";
}

export function assertTeamAccess(user: SessionUser, teamId: string) {
  if (!canAccessTeam(user, teamId)) throw new NotAllowedError();
}

export function assertTeamAdmin(user: SessionUser, teamId: string) {
  if (!canAdministerTeam(user, teamId)) throw new NotAllowedError();
}

export function assertFineManager(user: SessionUser, teamId: string) {
  if (!canManageFines(user, teamId)) throw new NotAllowedError();
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  ADMIN: "Træner/holdleder",
  TREASURER: "Kasserer",
  PLAYER: "Spiller",
};
