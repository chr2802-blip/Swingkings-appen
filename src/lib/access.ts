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
 * gave, marking somebody's fines paid once the box is open for payment, and withdrawing a challenge somebody else
 * reported. Giving fines is for everybody on the team.
 */
export function canManageFines(user: SessionUser, teamId: string) {
  if (user.role === "SUPER_ADMIN") return true;
  const role = roleOn(user, teamId);
  return role === "ADMIN" || role === "TREASURER";
}

/** Whoever gave a fine may take it back; otherwise it is the bødekasseformand's call. */
export function canDeleteFine(user: SessionUser, teamId: string, fine: { issuedById: string | null }) {
  return fine.issuedById === user.id || canManageFines(user, teamId);
}

/**
 * Club admin: writes club posts and makes club activities for the club's teams, and tidies
 * up after others on them. The super admin may too. A club admin sees nothing more of a
 * team than its players do.
 */
export function canAdministerClub(user: SessionUser, clubId: string | null | undefined) {
  if (!clubId) return false;
  return user.role === "SUPER_ADMIN" || user.clubAdminOf.includes(clubId);
}

export function assertClubAdmin(user: SessionUser, clubId: string | null | undefined) {
  if (!canAdministerClub(user, clubId)) throw new NotAllowedError();
}

/**
 * Who may change or delete a post, close its poll or show its result: whoever wrote it, the
 * team's admins for a team's post, and the club's admins for a club's.
 */
export function canChangePost(user: SessionUser, teamId: string, post: { authorId: string; clubId: string | null }) {
  if (post.authorId === user.id) return true;
  return post.clubId ? canAdministerClub(user, post.clubId) : canAdministerTeam(user, teamId);
}

export function assertTeamAdmin(user: SessionUser, teamId: string) {
  if (!canAdministerTeam(user, teamId)) throw new NotAllowedError();
}

export function assertFineManager(user: SessionUser, teamId: string) {
  if (!canManageFines(user, teamId)) throw new NotAllowedError();
}

export const CLUB_ADMIN_LABEL = "Klubadmin";

export const ROLE_LABEL: Record<MemberRole, string> = {
  ADMIN: "Admin",
  TREASURER: "Bødekasseformand",
  PLAYER: "Spiller",
};

/** The one person who looks after every team; not a role anybody is given on a team. */
export const SUPER_ADMIN_LABEL = "Super admin";
