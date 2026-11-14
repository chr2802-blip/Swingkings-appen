import type { MemberRole } from "@prisma/client";

/**
 * The team roles are a stack: spiller → bødekasseformand → admin, each with everything
 * the one below has (`canManageFines` lets admins in too). The members table shows that
 * as two ticks, Bøder and Admin; an admin's Bøder is ticked and cannot be taken off alone.
 */
export type RightColumn = "fines" | "admin";

const LEVEL: Record<MemberRole, number> = { PLAYER: 0, TREASURER: 1, ADMIN: 2 };
const COLUMN_LEVEL: Record<RightColumn, number> = { fines: 1, admin: 2 };
const BY_LEVEL: MemberRole[] = ["PLAYER", "TREASURER", "ADMIN"];

/** Whether the tick shows as set, and whether it is only there because a higher one is. */
export function rightState(role: MemberRole, column: RightColumn) {
  const has = LEVEL[role] >= COLUMN_LEVEL[column];
  return { checked: has, implied: has && LEVEL[role] > COLUMN_LEVEL[column] };
}

/**
 * The role one press on a tick gives: ticking climbs to that step, unticking the top
 * step goes one down (an admin who is unticked keeps Bøder). An implied tick changes nothing.
 */
export function roleAfterToggle(role: MemberRole, column: RightColumn): MemberRole {
  const { checked, implied } = rightState(role, column);
  if (implied) return role;
  return checked ? BY_LEVEL[COLUMN_LEVEL[column] - 1] : BY_LEVEL[COLUMN_LEVEL[column]];
}

/** The table's column headings and cell width, shared by the heading row and the ticks. */
export const RIGHT_COLUMNS = ["Bøder", "Admin", "Betalt"] as const;
export const RIGHT_CELL = "flex w-12 shrink-0 justify-center";
