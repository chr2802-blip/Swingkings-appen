import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { checkVote } from "./polls";

/**
 * Casting (or, in an open poll, changing) a vote. The poll is found through `teamDb`, so
 * another team's poll is not found.
 *
 * Anonymous: one transaction writes the ballot ("has voted") and the votes with no voter
 * on them — random ids, no timestamps. The ballot's primary key is what stops a second
 * vote: two presses at once and one of them fails on it. Open: the voter's earlier votes
 * are replaced.
 */
export async function castVote(
  teamId: string,
  userId: string,
  pollId: string,
  chosen: string[],
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const poll = await teamDb(teamId).poll.findFirst({
    where: { id: pollId },
    select: {
      id: true,
      anonymous: true,
      multipleChoice: true,
      closesAt: true,
      closedAt: true,
      options: { select: { id: true } },
      ballots: { where: { userId }, select: { userId: true } },
    },
  });
  if (!poll) return { ok: false, error: "Afstemningen findes ikke." };
  const check = checkVote({ ...poll, optionIds: poll.options.map((o) => o.id) }, chosen, poll.ballots.length > 0, now);
  if (!check.ok) return check;

  try {
    if (poll.anonymous) {
      await prisma.$transaction([
        prisma.pollBallot.create({ data: { pollId: poll.id, userId } }),
        prisma.pollVote.createMany({ data: check.optionIds.map((optionId) => ({ pollId: poll.id, optionId, voterId: null })) }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.pollVote.deleteMany({ where: { pollId: poll.id, voterId: userId } }),
        prisma.pollVote.createMany({ data: check.optionIds.map((optionId) => ({ pollId: poll.id, optionId, voterId: userId })) }),
        prisma.pollBallot.upsert({
          where: { pollId_userId: { pollId: poll.id, userId } },
          update: {},
          create: { pollId: poll.id, userId },
        }),
      ]);
    }
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "Du har allerede stemt." };
    throw error;
  }
  return { ok: true };
}
