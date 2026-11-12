import { createHash, randomBytes } from "crypto";
import type { InviteLink } from "@prisma/client";
import { prisma } from "./prisma";

/** 32 random bytes: a link nobody guesses, so it needs no code beside it. */
export function generateLinkToken() {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function joinPath(token: string) {
  return `/join/${token}`;
}

export type LinkProblem = "unknown" | "expired" | "used-up";

export const LINK_PROBLEM_TEXT: Record<LinkProblem, string> = {
  unknown: "Linket virker ikke. Måske er det trukket tilbage — bed træneren om et nyt.",
  expired: "Linket er udløbet. Bed træneren om et nyt.",
  "used-up": "Linket er brugt op. Bed træneren om et nyt.",
};

export function linkProblem(link: Pick<InviteLink, "expiresAt" | "uses" | "maxUses"> | null, now = new Date()): LinkProblem | null {
  if (!link) return "unknown";
  if (link.expiresAt <= now) return "expired";
  if (link.uses >= link.maxUses) return "used-up";
  return null;
}

/**
 * The link a token names, with its team, whether or not it can still be used. Crosses
 * teams on purpose: the token is what says which team, and the person has none yet.
 */
export async function findInviteLink(token: string) {
  if (!token) return null;
  return prisma.inviteLink.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    include: { team: { select: { id: true, name: true, photoId: true } } },
  });
}

export type Joiner =
  | { userId: string }
  | { newUser: { email: string; name: string; passwordHash: string } };

export type RedeemResult =
  | { ok: true; userId: string; teamId: string; joined: boolean }
  | { ok: false; problem: LinkProblem };

/**
 * Brings somebody onto the link's team. In one transaction: the use is counted with an
 * update that only matches while the link is unexpired and `uses < maxUses`, so two
 * people pressing at once on the last place cannot both get in, and a new account is
 * only created when there was a place for it.
 *
 * Everybody joins as a player. Somebody already on the team uses up no place and keeps
 * their role.
 */
export async function redeemInviteLink(linkId: string, joiner: Joiner, now = new Date()): Promise<RedeemResult> {
  return prisma.$transaction(async (tx) => {
    const link = await tx.inviteLink.findUnique({ where: { id: linkId } });
    if (!link) return { ok: false, problem: "unknown" } as const;

    if ("userId" in joiner) {
      const member = await tx.teamMember.findUnique({
        where: { userId_teamId: { userId: joiner.userId, teamId: link.teamId } },
      });
      if (member) {
        await tx.user.update({ where: { id: joiner.userId }, data: { activeTeamId: link.teamId } });
        return { ok: true, userId: joiner.userId, teamId: link.teamId, joined: false } as const;
      }
    }

    const counted = await tx.inviteLink.updateMany({
      where: { id: link.id, expiresAt: { gt: now }, uses: { lt: tx.inviteLink.fields.maxUses } },
      data: { uses: { increment: 1 } },
    });
    if (counted.count === 0) return { ok: false, problem: linkProblem(link, now) ?? "used-up" } as const;

    const userId =
      "userId" in joiner
        ? joiner.userId
        : (await tx.user.create({ data: joiner.newUser, select: { id: true } })).id;
    await tx.teamMember.create({ data: { userId, teamId: link.teamId, role: "PLAYER" } });
    await tx.user.update({ where: { id: userId }, data: { activeTeamId: link.teamId } });
    return { ok: true, userId, teamId: link.teamId, joined: true } as const;
  });
}
