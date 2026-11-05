import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { castVote } from "@/lib/voting";
import { makeMember, makeTeam } from "./factory";

async function pollFor(anonymous: boolean, multipleChoice = false) {
  const team = await makeTeam();
  const author = await makeMember(team.id, "Anna");
  const voter = await makeMember(team.id, "Bo");
  const post = await prisma.post.create({
    data: {
      teamId: team.id,
      authorId: author.id,
      poll: {
        create: {
          teamId: team.id,
          question: "Hvornår er der fest?",
          anonymous,
          multipleChoice,
          options: { create: [{ text: "Fredag", position: 0 }, { text: "Lørdag", position: 1 }] },
        },
      },
    },
    include: { poll: { include: { options: { orderBy: { position: "asc" } } } } },
  });
  const poll = post.poll!;
  return { team, voter, poll, friday: poll.options[0]!.id, saturday: poll.options[1]!.id };
}

describe("castVote", () => {
  it("stores an anonymous vote with no trace of the voter, and only once", async () => {
    const { team, voter, poll, friday, saturday } = await pollFor(true, true);
    expect(await castVote(team.id, voter.id, poll.id, [friday, saturday])).toEqual({ ok: true });

    const votes = await prisma.pollVote.findMany({ where: { pollId: poll.id } });
    expect(votes).toHaveLength(2);
    expect(votes.every((v) => v.voterId === null)).toBe(true);
    expect(await prisma.pollBallot.count({ where: { pollId: poll.id, userId: voter.id } })).toBe(1);

    expect(await castVote(team.id, voter.id, poll.id, [friday])).toMatchObject({ ok: false });
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(2);
  });

  it("takes one anonymous ballot however many presses arrive at once", async () => {
    const { team, voter, poll, friday } = await pollFor(true);
    const results = await Promise.all([1, 2, 3].map(() => castVote(team.id, voter.id, poll.id, [friday])));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(1);
  });

  it("lets an open poll's vote be changed, keeping one ballot", async () => {
    const { team, voter, poll, friday, saturday } = await pollFor(false);
    await castVote(team.id, voter.id, poll.id, [friday]);
    await castVote(team.id, voter.id, poll.id, [saturday]);
    const votes = await prisma.pollVote.findMany({ where: { pollId: poll.id } });
    expect(votes.map((v) => [v.optionId, v.voterId])).toEqual([[saturday, voter.id]]);
    expect(await prisma.pollBallot.count({ where: { pollId: poll.id } })).toBe(1);
  });

  it("refuses a closed poll and another team's poll", async () => {
    const { team, voter, poll, friday } = await pollFor(false);
    const other = await makeTeam("Andet hold");
    expect(await castVote(other.id, voter.id, poll.id, [friday])).toMatchObject({ ok: false });
    await prisma.poll.update({ where: { id: poll.id }, data: { closedAt: new Date() } });
    expect(await castVote(team.id, voter.id, poll.id, [friday])).toMatchObject({ ok: false });
    expect(await prisma.pollVote.count()).toBe(0);
  });
});
