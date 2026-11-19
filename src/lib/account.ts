import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { discardPhotos } from "./photos";
import { fineAmount, kr } from "./money";

/**
 * Someone's own account, across every team they are on: a temporary password an admin
 * hands out, and deleting the account for good. Both cross teams on purpose — an account
 * is not one team's — so they read through `prisma`, not `teamDb`.
 */

/** No 0/O, 1/l/I: read aloud or off a phone, nobody has to guess which it was. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const TEMPORARY_PASSWORD_LENGTH = 10;

/** A password an admin gives a member who has forgotten theirs. Used once, then replaced. */
export function generateTemporaryPassword(): string {
  let password = "";
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) password += ALPHABET[randomInt(ALPHABET.length)];
  return password;
}

/**
 * Why somebody may not (yet) delete their account, or null when they may:
 * - the super admin looks after the whole installation, and there is only ever one;
 * - the last admin of a team others are on would leave it with nobody to run it;
 * - fines owed and not marked paid would vanish from the box with the account.
 *   Fines from a team they have left still count: leaving does not pay them.
 */
export async function deletionBlocker(userId: string): Promise<string | null> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      role: true,
      memberships: { select: { teamId: true, role: true, finesPaidAt: true, team: { select: { name: true } } } },
    },
  });
  if (user.role === "SUPER_ADMIN") return "Super admin kan ikke slette sin konto.";

  for (const m of user.memberships.filter((m) => m.role === "ADMIN")) {
    const [admins, members] = await Promise.all([
      prisma.teamMember.count({ where: { teamId: m.teamId, role: "ADMIN" } }),
      prisma.teamMember.count({ where: { teamId: m.teamId } }),
    ]);
    if (admins === 1 && members > 1) return `Du er den eneste admin på ${m.team.name}. Gør en anden til admin først.`;
  }

  const fines = await prisma.fine.findMany({
    where: { playerId: userId },
    select: { teamId: true, units: true, unitPriceKr: true, team: { select: { name: true } } },
  });
  const owed = new Map<string, { name: string; kr: number }>();
  for (const fine of fines) {
    const row = owed.get(fine.teamId) ?? { name: fine.team.name, kr: 0 };
    row.kr += fineAmount(fine);
    owed.set(fine.teamId, row);
  }
  for (const [teamId, row] of owed) {
    const paid = user.memberships.find((m) => m.teamId === teamId)?.finesPaidAt;
    if (row.kr > 0 && !paid) {
      return `Du skylder ${kr(row.kr)} i bøder på ${row.name}. Kontoen kan slettes, når de er betalt.`;
    }
  }
  return null;
}

/**
 * Deletes the account and what is theirs alone: their messages, posts, comments, votes,
 * fines received, sign-ups, notifications and push subscriptions go with the row (the
 * schema's cascades). What belongs to the team stays: fines they gave keep standing with
 * no giver, tasks they made keep standing with no maker. Their pictures — profile, chat
 * and feed — are deleted too, bytes and stored objects both. Check `deletionBlocker` first.
 */
export async function deleteAccount(userId: string) {
  const [user, messages, posts] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { photo: { select: { id: true, teamId: true } } } }),
    prisma.chatMessage.findMany({ where: { authorId: userId }, select: { teamId: true, photos: { select: { photoId: true } } } }),
    // A club post's pictures are filed under the team they were uploaded on, so each is read with its own.
    prisma.post.findMany({ where: { authorId: userId }, select: { photos: { select: { photoId: true, photo: { select: { teamId: true } } } } } }),
  ]);
  const photosByTeam = new Map<string, string[]>();
  const add = (teamId: string, photoId: string) => photosByTeam.set(teamId, [...(photosByTeam.get(teamId) ?? []), photoId]);
  if (user.photo) add(user.photo.teamId, user.photo.id);
  for (const row of messages) for (const p of row.photos) add(row.teamId, p.photoId);
  for (const row of posts) for (const p of row.photos) add(p.photo.teamId, p.photoId);

  await prisma.user.delete({ where: { id: userId } });
  // Only pictures nothing else points at go: one a teammate reused is left alone.
  for (const [teamId, ids] of photosByTeam) await discardPhotos(teamId, ids);
}
