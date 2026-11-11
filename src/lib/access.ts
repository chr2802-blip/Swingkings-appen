import type { MemberRole } from "@prisma/client";
import type { SessionUser } from "./auth";
import { NotAllowedError } from "./not-allowed";

/**
 * Who may do what, answered per team: the bødekasseformand of one team is an ordinary
 * player on the next. There are three team roles — spiller, bødekasseformand, admin — and
 * one super admin on the whole installation, who may do everything everywhere.
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

/**
 * Admin: the team's settings — members and their roles, invitation links, the
 * calendar link — and tidying up after others (their posts, comments, messages, tasks).
 */
export function canAdministerTeam(user: SessionUser, teamId: string) {
  return user.role === "SUPER_ADMIN" || roleOn(user, teamId) === "ADMIN";
}

/**
 * Bødekasseformand, and every admin: the fine catalogue, deleting a fine somebody else
 * gave, and settling a disputed challenge. Giving fines is for everybody on the team.
 */
export function canManageFines(user: SessionUser, teamId: string) {
  if (user.role === "SUPER_ADMIN") return true;
  const role = roleOn(user, teamId);
  return role === "ADMIN" || role === "TREASURER";
}

/** Whoever gave a fine may take it back; otherwise it is the bødekasseformand's call. */
export function canDeleteFine(user: SessionUser, teamId: string, fine: { issuedById: string }) {
  return fine.issuedById === user.id || canManageFines(user, teamId);
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
  ADMIN: "Admin",
  TREASURER: "Bødekasseformand",
  PLAYER: "Spiller",
};

/** What each team role may do, as the settings page explains it. */
export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  PLAYER: "Alt det daglige: aktiviteter, opgaver, bøder til andre, udfordringer, opslag og afstemninger.",
  TREASURER: "Som spiller, og opretter, retter og sletter bødekataloget.",
  ADMIN: "Det hele, også holdindstillinger, medlemmer, roller, invitationslinks og standardopgaver.",
};

/** The one person who looks after every team; not a role anybody is given on a team. */
export const SUPER_ADMIN_LABEL = "Super admin";
