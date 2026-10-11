import type { MemberRole } from "@prisma/client";
import { teamDb } from "./team-db";

export type RosterMember = {
  userId: string;
  name: string;
  photoId: string | null;
  role: MemberRole;
  shirtNumber: number | null;
  takesTasks: boolean;
};

/** Everybody on the team, by name. The one way a page asks "who is on this team". */
export async function teamRoster(teamId: string): Promise<RosterMember[]> {
  const members = await teamDb(teamId).teamMember.findMany({
    select: {
      role: true,
      shirtNumber: true,
      takesTasks: true,
      user: { select: { id: true, name: true, photoId: true } },
    },
  });
  return members
    .map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      photoId: m.user.photoId,
      role: m.role,
      shirtNumber: m.shirtNumber,
      takesTasks: m.takesTasks,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}
