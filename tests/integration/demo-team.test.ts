import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { balances } from "@/lib/money";
import { DEMO_EMAIL_DOMAIN, DEMO_TEAM_NAME, createDemoTeam, removeDemoTeam } from "@/lib/demo-team";
import { createDemoTeamAction, removeDemoTeamAction } from "@/app/actions/teams";
import { makeSquad, makeUser, signIn } from "../helpers/factories";
import { expectRedirect } from "../helpers/expect";

const PEOPLE = 18;

describe("createDemoTeam", () => {
  it("makes a team in the middle of its season: people, a catalogue, a calendar, jobs, chat and a feed", async () => {
    const now = new Date();
    const team = await createDemoTeam({ password: "demo-password", now });
    const teamId = team.id;
    expect(team.name).toBe(DEMO_TEAM_NAME);
    expect(await prisma.teamMember.count({ where: { teamId } })).toBe(PEOPLE);
    // The team's leader and the coach, who is on the team without being handed jobs.
    expect(await prisma.teamMember.count({ where: { teamId, role: "ADMIN" } })).toBe(2);
    expect(await prisma.teamMember.count({ where: { teamId, role: "TREASURER" } })).toBe(1);
    expect(await prisma.teamMember.count({ where: { teamId, takesTasks: false } })).toBe(1);

    expect(await prisma.fineType.count({ where: { teamId, archivedAt: null } })).toBe(13);
    expect(await prisma.fineType.count({ where: { teamId, archivedAt: { not: null } } })).toBe(1);
    expect(await prisma.fine.count({ where: { teamId } })).toBeGreaterThan(60);

    // Twelve matches played and six to come, ten trainings behind and six ahead, three made by hand.
    const activities = await prisma.match.groupBy({ by: ["kind", "source"], where: { teamId }, _count: { _all: true } });
    expect(Object.fromEntries(activities.map((row) => [`${row.kind} ${row.source}`, row._count._all]))).toEqual({
      "MATCH KAMPKLAR": 18, "TRAINING KAMPKLAR": 16, "OTHER MANUAL": 3,
    });
    expect(await prisma.match.count({ where: { teamId, startsAt: { lt: now } } })).toBe(23);
    expect(await prisma.match.count({ where: { teamId, cancelledAt: { not: null } } })).toBe(1);
    expect(await prisma.activitySignup.count({ where: { teamId } })).toBe(38);

    expect(await prisma.chatMessage.count({ where: { teamId } })).toBe(48);
    expect(await prisma.chatMessage.count({ where: { teamId, createdAt: { gt: now } } })).toBe(0);
    expect(await prisma.post.count({ where: { teamId } })).toBe(20);
    expect(await prisma.post.count({ where: { teamId, createdAt: { gt: now } } })).toBe(0);
    expect(await prisma.postComment.count({ where: { post: { teamId } } })).toBe(24);
    expect(await prisma.postLike.count({ where: { post: { teamId } } })).toBeGreaterThan(60);
    expect(await prisma.post.count({ where: { teamId, likes: { none: {} } } })).toBe(0);
    expect(await prisma.poll.count({ where: { teamId } })).toBe(6);
    expect(await prisma.poll.count({ where: { teamId, closedAt: { not: null } } })).toBe(3);

    const mads = await prisma.user.findUniqueOrThrow({ where: { email: `mads${DEMO_EMAIL_DOMAIN}` } });
    expect(await bcrypt.compare("demo-password", mads.passwordHash)).toBe(true);
  });

  it("is the same team every time", async () => {
    const now = new Date();
    const picture = async () => {
      const team = await createDemoTeam({ now });
      const fines = await prisma.fine.findMany({ where: { teamId: team.id, challengeId: null }, select: { reason: true, createdAt: true, player: { select: { name: true } } } });
      const likes = await prisma.postLike.findMany({ where: { post: { teamId: team.id } }, select: { user: { select: { name: true } }, post: { select: { createdAt: true } } } });
      const key = (rows: object[]) => rows.map((row) => JSON.stringify(row)).sort();
      return { fines: key(fines), likes: key(likes) };
    };
    expect(await picture()).toEqual(await picture());
  });

  it("gives the players a password nobody knows unless one is asked for", async () => {
    await createDemoTeam();
    const mads = await prisma.user.findUniqueOrThrow({ where: { email: `mads${DEMO_EMAIL_DOMAIN}` } });
    expect(await bcrypt.compare("demo-password", mads.passwordHash)).toBe(false);
  });

  it("has done the jobs of the matches played, and handed out those of the matches to come", async () => {
    const now = new Date();
    const team = await createDemoTeam({ now });
    const tasks = await prisma.task.findMany({
      where: { teamId: team.id, match: { kind: "MATCH" } },
      select: { title: true, doneAt: true, dueAt: true, createdAt: true, match: { select: { startsAt: true, cancelledAt: true } }, assignees: { select: { userId: true, user: { select: { name: true } } } } },
    });
    const played = tasks.filter((task) => task.match!.startsAt < now);
    const coming = tasks.filter((task) => task.match!.startsAt > now);
    // Kit and fruit at each of the twelve, and driving to the six away.
    expect(played).toHaveLength(30);
    // Only the kit from the latest match is still waiting.
    expect(played.filter((task) => !task.doneAt).map((task) => task.title)).toEqual(["Trøjevask"]);
    expect(played.every((task) => task.createdAt < task.dueAt!)).toBe(true);
    // Three standard jobs on each of the six, none done yet, every one in somebody's hands.
    expect(coming).toHaveLength(18);
    expect(coming.every((task) => !task.doneAt && task.assignees.length > 0)).toBe(true);
    // The coach is never picked, and nobody is left with far more than the others.
    const jobs = new Map<string, number>();
    for (const task of tasks) for (const hand of task.assignees) jobs.set(hand.user.name, (jobs.get(hand.user.name) ?? 0) + 1);
    expect(jobs.has("Henrik Storm")).toBe(false);
    expect(jobs.size).toBe(PEOPLE - 1);
    expect(Math.max(...jobs.values()) - Math.min(...jobs.values())).toBeLessThanOrEqual(1);
    // A cancelled training shows as cancelled and has no jobs.
    expect(await prisma.task.count({ where: { teamId: team.id, match: { cancelledAt: { not: null } } } })).toBe(0);
  });

  it("keeps an anonymous poll's votes apart from who voted", async () => {
    const team = await createDemoTeam();
    const polls = await prisma.poll.findMany({ where: { teamId: team.id, anonymous: true }, orderBy: { createdAt: "asc" } });
    expect(polls.map((poll) => poll.question)).toEqual(["Træningslejr til foråret?", "Hvornår skal vi holde fest?"]);
    expect(await prisma.pollVote.count({ where: { poll: { teamId: team.id, anonymous: true }, voterId: { not: null } } })).toBe(0);
    const [camp, party] = polls;
    // One answer each: as many votes as people who voted.
    expect(await prisma.pollBallot.count({ where: { pollId: camp!.id } })).toBe(15);
    expect(await prisma.pollVote.count({ where: { pollId: camp!.id } })).toBe(15);
    // Several answers allowed: more votes than voters, never more than every voter choosing everything.
    expect(await prisma.pollBallot.count({ where: { pollId: party!.id } })).toBe(10);
    expect(await prisma.pollVote.count({ where: { pollId: party!.id } })).toBe(17);
  });

  it("names the voter on every vote in an open poll, one vote each, for a player who is an answer", async () => {
    const team = await createDemoTeam();
    const polls = await prisma.poll.findMany({
      where: { teamId: team.id, anonymous: false },
      include: { votes: true, ballots: true, options: true },
    });
    expect(polls).toHaveLength(4);
    for (const poll of polls) {
      expect(poll.votes.length).toBeGreaterThan(5);
      expect(poll.votes.every((vote) => vote.voterId)).toBe(true);
      expect(poll.votes.map((vote) => vote.voterId).sort()).toEqual(poll.ballots.map((ballot) => ballot.userId).sort());
      expect(new Set(poll.votes.map((vote) => vote.voterId)).size).toBe(poll.votes.length);
    }
    const playerOfTheMatch = polls.filter((poll) => poll.matchId);
    expect(playerOfTheMatch).toHaveLength(3);
    for (const poll of playerOfTheMatch) {
      expect(poll.options).toHaveLength(14);
      expect(poll.options.every((option) => option.playerId)).toBe(true);
    }
  });

  it("brings its own pictures, each one in a post or a chat message", async () => {
    const team = await createDemoTeam();
    expect(await prisma.photo.count({ where: { teamId: team.id } })).toBe(9);
    expect(await prisma.photo.count({ where: { teamId: team.id, postPhotos: { none: {} }, chatMessages: { none: {} } } })).toBe(0);
    expect(await prisma.chatMessage.count({ where: { teamId: team.id, photoId: { not: null } } })).toBe(2);
    const album = await prisma.post.findFirstOrThrow({ where: { teamId: team.id, body: { startsWith: "5-2 over Herlev" } }, include: { photos: true } });
    expect(album.photos.map((photo) => photo.position).sort()).toEqual([0, 1, 2]);
    await removeDemoTeam();
    expect(await prisma.photo.count()).toBe(0);
  });

  it("is made afresh when made twice, and leaves other teams alone", async () => {
    const { team: real, anna } = await makeSquad();
    await createDemoTeam();
    const second = await createDemoTeam();
    expect(await prisma.team.findMany({ where: { isDemo: true }, select: { id: true } })).toEqual([{ id: second.id }]);
    expect(await prisma.user.count({ where: { isDemo: true } })).toBe(PEOPLE);

    expect(await removeDemoTeam()).toEqual({ teams: 1, users: PEOPLE });
    expect(await prisma.team.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: anna.id } })).not.toBeNull();
    expect(await prisma.user.count({ where: { isDemo: true } })).toBe(0);
  });

  it("removes only what it made: a real team with its name, and a real player with its domain, survive", async () => {
    const lookalike = await prisma.team.create({ data: { name: DEMO_TEAM_NAME } });
    const real = await makeUser({ name: "Rigtig", email: `rigtig${DEMO_EMAIL_DOMAIN}` });
    await createDemoTeam();
    expect(await removeDemoTeam()).toEqual({ teams: 1, users: PEOPLE });
    expect(await prisma.team.findUnique({ where: { id: lookalike.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
    // And pressing the button again leaves the lookalike alone as well.
    await createDemoTeam();
    expect(await prisma.team.findUnique({ where: { id: lookalike.id } })).not.toBeNull();
  });

  it("has accounts that add up: everybody reset once, Lucas again, and nobody below zero", async () => {
    const now = new Date();
    const team = await createDemoTeam({ now });
    const players = await prisma.user.findMany({ where: { isDemo: true } });
    const fines = await prisma.fine.findMany({ where: { teamId: team.id } });
    const owed = balances(players.map((p) => p.id), fines);
    const owes = (first: string) => owed.find((b) => b.userId === players.find((p) => p.name.startsWith(first))!.id)!.owesKr;

    // Everything from before the reset forty days ago is history, and there is plenty of it.
    const resetAt = new Date(now.getTime() - 40 * 86_400_000);
    const old = fines.filter((fine) => fine.createdAt < resetAt);
    expect(old.length).toBeGreaterThan(25);
    expect(old.every((fine) => fine.clearedAt?.getTime() === resetAt.getTime())).toBe(true);
    expect(fines.every((fine) => !fine.clearedAt || fine.clearedAt > fine.createdAt)).toBe(true);

    expect(owes("Lucas")).toBe(0);
    expect(fines.some((fine) => fine.playerId === players.find((p) => p.name.startsWith("Lucas"))!.id && fine.createdAt > resetAt)).toBe(true);
    expect(owed.every((b) => b.owesKr >= 0)).toBe(true);
    expect(owed.filter((b) => b.owesKr > 0).length).toBeGreaterThan(10);
    // The red card alone is 150 kr., and the team is owed what its open fines come to.
    expect(owes("Victor")).toBeGreaterThanOrEqual(150);
    const open = fines.filter((fine) => !fine.clearedAt);
    expect(owed.reduce((sum, b) => sum + b.owesKr, 0)).toBe(open.reduce((sum, fine) => sum + fine.units * fine.unitPriceKr, 0));
  });

  it("has challenges waiting, withdrawn and approved — and every approved one moved its whole stake", async () => {
    const team = await createDemoTeam();
    const challenges = await prisma.challenge.findMany({ where: { teamId: team.id }, include: { fines: true } });
    const withStatus = (status: string) => challenges.filter((challenge) => challenge.status === status);
    expect(withStatus("PENDING")).toHaveLength(3);
    expect(withStatus("CANCELLED")).toHaveLength(1);
    expect(withStatus("SETTLED")).toHaveLength(5);
    expect(withStatus("SETTLED").map((challenge) => challenge.units).sort()).toEqual([1, 2, 2, 3, 3]);
    for (const challenge of withStatus("SETTLED")) {
      expect(challenge.approvedById).not.toBe(challenge.reportedById);
      expect(challenge.settledAt!.getTime()).toBeGreaterThan(challenge.createdAt.getTime());
      expect(challenge.fines.map((fine) => [fine.playerId, fine.units]).sort()).toEqual(
        [[challenge.winnerId, -challenge.units], [challenge.loserId, challenge.units]].sort(),
      );
    }
    expect(challenges.filter((challenge) => challenge.status !== "SETTLED").every((challenge) => challenge.fines.length === 0)).toBe(true);
  });
});

describe("the test team on /admin", () => {
  it("lets the super admin make it, as its admin, and take it away again", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    expect(await createDemoTeamAction()).toEqual({ ok: true, note: "Testholdet er oprettet, og du er admin på det." });
    const team = await prisma.team.findFirstOrThrow({ where: { name: DEMO_TEAM_NAME } });
    expect(await prisma.teamMember.findFirst({ where: { teamId: team.id, userId: root.id } })).toMatchObject({ role: "ADMIN" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: root.id } })).activeTeamId).toBe(team.id);

    expect(await removeDemoTeamAction()).toEqual({ ok: true, note: "Testholdet og dets spillere er slettet." });
    expect(await prisma.team.count({ where: { name: DEMO_TEAM_NAME } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: root.id } })).not.toBeNull();
    expect(await removeDemoTeamAction()).toEqual({ ok: true, note: "Der var intet testhold." });
  });

  it("is nobody else's: even a team's admin is sent away", async () => {
    const { admin } = await makeSquad();
    await createDemoTeam();
    await signIn(admin);
    await expectRedirect(() => createDemoTeamAction(), "/oversigt");
    await expectRedirect(() => removeDemoTeamAction(), "/oversigt");
    expect(await prisma.team.count({ where: { name: DEMO_TEAM_NAME } })).toBe(1);
  });
});
