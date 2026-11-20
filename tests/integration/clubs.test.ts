import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import {
  addClubAdmin,
  createClub,
  createClubPost,
  deleteClub,
  deleteClubActivity,
  removeClubAdmin,
  renameClub,
  saveClubActivity,
  setTeamClubAction,
} from "@/app/actions/club";
import { addComment, deleteComment, deletePost, editPost, pinPost, vote, closePoll } from "@/app/actions/social";
import { react } from "@/app/actions/reactions";
import { setSignup } from "@/app/actions/activities";
import { addActivityComment, deleteActivityComment } from "@/app/actions/activity-comments";
import { createTask } from "@/app/actions/tasks";
import { removeMember } from "@/app/actions/teams";
import { startNewSeason } from "@/app/actions/season";
import { GET as serve } from "@/app/api/photos/[id]/route";
import { feedPosts } from "@/lib/feed";
import { findActivitySeenBy, homeTeams, reachDb } from "@/lib/club-reach";
import { clubOfTeam, pruneClubAdmins, rosterAcross, setTeamClub } from "@/lib/clubs";
import { PHOTO_FIELD, formData, joinTeam, makeMatch, makeMember, makePhoto, makeSquad, makeUser, signIn } from "../helpers/factories";
import { captureRedirect, expectDenied, expectRedirect } from "../helpers/expect";

/**
 * A club with two teams and a club admin (Anna, who plays on the first), a third team in the
 * same club that is not chosen, and a team outside the club.
 */
async function club() {
  const row = await prisma.club.create({ data: { name: "Swingkings FC" } });
  const first = await makeSquad("Herrer 1");
  const second = await makeSquad("Damer 1");
  const third = await makeSquad("Oldboys");
  const outside = await makeSquad("Naboklubben");
  await prisma.team.updateMany({ where: { id: { in: [first.team.id, second.team.id, third.team.id] } }, data: { clubId: row.id } });
  await prisma.clubAdmin.create({ data: { clubId: row.id, userId: first.anna.id } });
  return { club: row, first, second, third, outside, clubAdmin: first.anna };
}

const notices = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function clubPost(setup: Awaited<ReturnType<typeof club>>, fields: Record<string, string | string[]> = {}) {
  await signIn(setup.clubAdmin);
  expect(
    await createClubPost(undefined, formData({ body: "Klubdag på lørdag!", teamId: [setup.first.team.id, setup.second.team.id], ...fields })),
  ).toEqual({ ok: true });
  return prisma.post.findFirstOrThrow({ where: { clubId: setup.club.id }, include: { poll: { include: { options: true } } } });
}

const fetchPhoto = (id: string) => serve(new Request(`http://localhost/api/photos/${id}`), { params: Promise.resolve({ id }) });

describe("the super admin's clubs", () => {
  it("makes a club, puts teams in it, names a club admin who plays there, and takes them away again", async () => {
    const boss = await makeUser({ role: "SUPER_ADMIN" });
    const { team, anna } = await makeSquad();
    const stranger = await makeSquad("Andre");
    await signIn(boss);
    const opened = await captureRedirect(() => createClub(undefined, formData({ name: "  Swingkings FC " })));
    const made = await prisma.club.findFirstOrThrow();
    expect(made.name).toBe("Swingkings FC");
    // Made, the club's own page opens: its teams are made there.
    expect(opened).toBe(`/admin/klubber/${made.id}`);

    // A club admin is always a player on one of the club's teams.
    expect(await addClubAdmin(undefined, formData({ clubId: made.id, userId: anna.id }))).toEqual({
      ok: false,
      error: "En klubadmin skal spille på et af klubbens hold.",
    });
    expect(await setTeamClubAction(undefined, formData({ teamId: team.id, clubId: made.id }))).toEqual({ ok: true });
    expect(await addClubAdmin(undefined, formData({ clubId: made.id, userId: anna.id }))).toEqual({ ok: true });
    expect(await addClubAdmin(undefined, formData({ clubId: made.id, userId: stranger.anna.id }))).toMatchObject({ ok: false });
    expect(await prisma.clubAdmin.findMany({ select: { userId: true } })).toEqual([{ userId: anna.id }]);
    expect(await clubOfTeam(team.id)).toEqual({ id: made.id, name: "Swingkings FC" });

    expect(await setTeamClubAction(undefined, formData({ teamId: team.id, clubId: "findes-ikke" }))).toEqual({ ok: false, error: "Klubben findes ikke." });
    // A team always has a club: it is moved to another, never taken out.
    expect(await setTeamClubAction(undefined, formData({ teamId: team.id, clubId: "" }))).toEqual({ ok: false, error: "Et hold skal have en klub." });
    expect(await clubOfTeam(team.id)).toEqual({ id: made.id, name: "Swingkings FC" });
    expect(await removeClubAdmin(undefined, formData({ clubId: made.id, userId: anna.id }))).toEqual({ ok: true });
    expect(await prisma.clubAdmin.count()).toBe(0);
    expect(await createClub(undefined, formData({ name: "" }))).toMatchObject({ ok: false });
  });

  it("is the super admin's alone", async () => {
    const setup = await club();
    for (const who of [setup.clubAdmin, setup.first.admin]) {
      await signIn(who);
      await expectRedirect(() => createClub(undefined, formData({ name: "Min klub" })), "/oversigt");
      await expectRedirect(() => addClubAdmin(undefined, formData({ clubId: setup.club.id, userId: setup.first.bo.id })), "/oversigt");
      await expectRedirect(() => removeClubAdmin(undefined, formData({ clubId: setup.club.id, userId: setup.clubAdmin.id })), "/oversigt");
      await expectRedirect(() => setTeamClubAction(undefined, formData({ teamId: setup.outside.team.id, clubId: setup.club.id })), "/oversigt");
      await expectRedirect(() => deleteClub(undefined, formData({ clubId: setup.club.id })), "/oversigt");
      await expectRedirect(() => renameClub(undefined, formData({ clubId: setup.club.id, name: "Min klub" })), "/oversigt");
    }
    expect(await prisma.club.findMany({ select: { name: true } })).toEqual([{ name: "Swingkings FC" }]);
  });

  it("renames a club, and refuses no name or a club that is not there", async () => {
    const setup = await club();
    await signIn(await makeUser({ role: "SUPER_ADMIN" }));
    expect(await renameClub(undefined, formData({ clubId: setup.club.id, name: " Swingkings IF " }))).toEqual({ ok: true });
    expect(await clubOfTeam(setup.first.team.id)).toEqual({ id: setup.club.id, name: "Swingkings IF" });
    expect(await renameClub(undefined, formData({ clubId: setup.club.id, name: " " }))).toEqual({ ok: false, error: "Giv klubben et navn." });
    expect(await renameClub(undefined, formData({ clubId: "findes-ikke", name: "X" }))).toEqual({ ok: false, error: "Klubben findes ikke." });
    expect((await prisma.club.findUniqueOrThrow({ where: { id: setup.club.id } })).name).toBe("Swingkings IF");
  });

  it("deletes a club with its posts and activities once its teams are moved — a team always has a club", async () => {
    const setup = await club();
    await clubPost(setup, { [PHOTO_FIELD]: (await makePhoto(setup.first.team.id)).id });
    await prisma.match.create({ data: { clubId: setup.club.id, title: "Klubdag", startsAt: new Date(Date.now() + 864e5), kind: "OTHER" } });
    await signIn(await makeUser({ role: "SUPER_ADMIN" }));
    expect(await deleteClub(undefined, formData({ clubId: setup.club.id }))).toEqual({ ok: false, error: "Klubben har hold. Flyt eller slet dem først." });
    expect(await prisma.club.count()).toBe(1);

    const other = await prisma.club.create({ data: { name: "Naboklubben" } });
    for (const team of [setup.first, setup.second, setup.third]) {
      expect(await setTeamClubAction(undefined, formData({ teamId: team.team.id, clubId: other.id }))).toEqual({ ok: true });
    }
    await expectRedirect(() => deleteClub(undefined, formData({ clubId: setup.club.id })), "/admin");
    expect(await prisma.post.count({ where: { teamId: null } })).toBe(0);
    expect(await prisma.match.count({ where: { teamId: null } })).toBe(0);
    expect(await prisma.photo.count()).toBe(0);
    expect(await prisma.team.count({ where: { clubId: other.id } })).toBe(3);
    expect(await prisma.clubAdmin.count()).toBe(0);
  });
});

describe("a club post", () => {
  it("is shown in the feed of the teams chosen, and nowhere else", async () => {
    const setup = await club();
    const post = await clubPost(setup);
    expect(post).toMatchObject({ teamId: null, clubId: setup.club.id, authorId: setup.clubAdmin.id, body: "Klubdag på lørdag!" });

    const seen = async (teamId: string, viewerId: string) =>
      (await feedPosts(teamId, { id: viewerId, canAdminister: false })).map((p) => ({ id: p.id, club: p.club?.name ?? null }));
    expect(await seen(setup.first.team.id, setup.first.bo.id)).toEqual([{ id: post.id, club: "Swingkings FC" }]);
    expect(await seen(setup.second.team.id, setup.second.bo.id)).toEqual([{ id: post.id, club: "Swingkings FC" }]);
    // In the club, but not chosen; and outside the club.
    expect(await seen(setup.third.team.id, setup.third.bo.id)).toEqual([]);
    expect(await seen(setup.outside.team.id, setup.outside.bo.id)).toEqual([]);
    // `teamDb` never finds a club's row: a team's own code cannot reach it by accident.
    expect(await teamDb(setup.first.team.id).post.count()).toBe(0);
  });

  it("tells everybody on the teams chosen once — on two of them, once — and nobody else", async () => {
    const setup = await club();
    // Bo of the second team also plays on the first.
    await joinTeam(setup.second.bo.id, setup.first.team.id);
    await clubPost(setup);
    const second = await notices(setup.second.bo.id);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ teamId: setup.second.team.id, category: "FEED", title: "Nyt fra Swingkings FC" });
    expect(await notices(setup.first.bo.id)).toHaveLength(1);
    expect(await notices(setup.clubAdmin.id)).toHaveLength(0);
    expect(await notices(setup.third.bo.id)).toHaveLength(0);
    expect(await notices(setup.outside.bo.id)).toHaveLength(0);
  });

  it("is written by the club's admins only, to the club's own teams", async () => {
    const setup = await club();
    const teams = [setup.first.team.id, setup.second.team.id];
    // A player, and a team's admin, are nothing in the club.
    for (const who of [setup.first.bo, setup.first.admin, setup.outside.admin]) {
      await signIn(who);
      await expectDenied(() => createClubPost(undefined, formData({ body: "Hej", teamId: teams })));
    }
    await signIn(setup.clubAdmin);
    expect(await createClubPost(undefined, formData({ body: "Hej", teamId: [setup.first.team.id, setup.outside.team.id] }))).toEqual({
      ok: false,
      error: "Vælg de hold, opslaget skal ud til.",
    });
    expect(await createClubPost(undefined, formData({ body: "Hej" }))).toEqual({ ok: false, error: "Vælg de hold, opslaget skal ud til." });
    expect(await createClubPost(undefined, formData({ teamId: teams }))).toEqual({ ok: false, error: "Vælg billeder, skriv noget eller lav en afstemning." });
    // A club admin looking at a team outside the club is no club admin there.
    await joinTeam(setup.clubAdmin.id, setup.outside.team.id);
    await prisma.user.update({ where: { id: setup.clubAdmin.id }, data: { activeTeamId: setup.outside.team.id } });
    await expectDenied(() => createClubPost(undefined, formData({ body: "Hej", teamId: teams })));
    expect(await prisma.post.count()).toBe(0);
  });

  it("gets comments, reactions and answers from every team it is shown to, together", async () => {
    const setup = await club();
    const post = await clubPost(setup);
    await signIn(setup.second.bo);
    expect(await addComment(undefined, formData({ postId: post.id, body: "Vi kommer!" }))).toEqual({ ok: true });
    expect(await react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "on" }))).toEqual({ ok: true });
    const comment = await prisma.postComment.findFirstOrThrow({ where: { postId: post.id } });

    // The author, on the first team, hears of the comment there.
    expect((await notices(setup.clubAdmin.id)).map((n) => ({ teamId: n.teamId, category: n.category }))).toEqual([
      { teamId: setup.first.team.id, category: "COMMENTS" },
    ]);

    // Somebody on the first team answers: Bo of the second team hears it on his own.
    await signIn(setup.first.bo);
    expect(await addComment(undefined, formData({ postId: post.id, parentId: comment.id, body: "Fedt" }))).toEqual({ ok: true });
    expect(await react(undefined, formData({ target: "comment", id: comment.id, kind: "HEART", on: "on" }))).toEqual({ ok: true });
    expect((await notices(setup.second.bo.id)).filter((n) => n.category === "COMMENTS")).toMatchObject([
      { teamId: setup.second.team.id, title: `${setup.first.bo.name} svarede på din kommentar` },
    ]);
    const feed = await feedPosts(setup.first.team.id, { id: setup.first.bo.id, canAdminister: false });
    expect(feed[0]!.comments.map((c) => c.body)).toEqual(["Vi kommer!", "Fedt"]);
    expect(feed[0]!.reactions.map((r) => r.userId)).toEqual([setup.second.bo.id]);

    // Outside the club, and in it but not chosen: not found.
    for (const who of [setup.outside.bo, setup.third.bo]) {
      await signIn(who);
      expect(await addComment(undefined, formData({ postId: post.id, body: "Hej" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
      expect(await react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "on" }))).toEqual({
        ok: false,
        error: "Det findes ikke længere.",
      });
      expect(await react(undefined, formData({ target: "comment", id: comment.id, kind: "CROWN", on: "on" }))).toMatchObject({ ok: false });
    }
    expect(await prisma.postComment.count()).toBe(2);
  });

  it("has its comments tidied by the club's admins, not by a team's", async () => {
    const setup = await club();
    const post = await clubPost(setup);
    await signIn(setup.first.bo);
    await addComment(undefined, formData({ postId: post.id, body: "Fra Herrer 1" }));
    const comment = await prisma.postComment.findFirstOrThrow();
    await signIn(setup.second.admin);
    expect(await deleteComment(undefined, formData({ id: comment.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    await signIn(setup.first.admin);
    expect(await deleteComment(undefined, formData({ id: comment.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    await signIn(setup.clubAdmin);
    expect(await deleteComment(undefined, formData({ id: comment.id }))).toEqual({ ok: true });
    expect(await prisma.postComment.count()).toBe(0);
  });

  it("is pinned, edited and deleted by the club's admins and its author, not by a team's admins", async () => {
    const setup = await club();
    const post = await clubPost(setup);
    await signIn(setup.first.admin);
    expect(await pinPost(undefined, formData({ id: post.id, pinned: "on" }))).toEqual({ ok: false, error: "Klubopslag fastgøres af klubbens admins." });
    expect(await editPost(undefined, formData({ id: post.id, body: "Ændret" }))).toEqual({ ok: false, error: "Det er ikke dit opslag." });
    expect(await deletePost(undefined, formData({ id: post.id }))).toEqual({ ok: false, error: "Det er ikke dit opslag." });
    await signIn(setup.outside.admin);
    expect(await editPost(undefined, formData({ id: post.id, body: "Ændret" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });

    // Another of the club's admins, on the second team.
    await prisma.clubAdmin.create({ data: { clubId: setup.club.id, userId: setup.second.admin.id } });
    await signIn(setup.second.admin);
    expect(await pinPost(undefined, formData({ id: post.id, pinned: "on" }))).toEqual({ ok: true });
    expect(await editPost(undefined, formData({ id: post.id, body: "Klubdag søndag" }))).toEqual({ ok: true });
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ body: "Klubdag søndag", pinnedAt: expect.any(Date) });
    expect(await deletePost(undefined, formData({ id: post.id }))).toEqual({ ok: true });
    expect(await prisma.post.count()).toBe(0);
  });

  it("carries a poll everybody on its teams votes in, closed by the club's admins", async () => {
    const setup = await club();
    await signIn(setup.clubAdmin);
    expect(
      await createClubPost(undefined, formData({ teamId: [setup.first.team.id, setup.second.team.id], withPoll: "on", pollQuestion: "Grill?", pollKind: "players" })),
    ).toEqual({ ok: false, error: "En klubafstemning har skrevne svar." });
    const post = await clubPost(setup, { body: "", withPoll: "on", pollQuestion: "Grill?", pollOption: ["Ja", "Nej"] });
    const poll = post.poll!;
    expect(poll).toMatchObject({ teamId: null, clubId: setup.club.id });
    const yes = poll.options.find((o) => o.text === "Ja")!.id;
    expect((await notices(setup.second.bo.id))[0]).toMatchObject({ title: "Swingkings FC har lavet en afstemning 🗳️", body: "Grill?" });

    for (const who of [setup.first.bo, setup.second.bo]) {
      await signIn(who);
      expect(await vote(undefined, formData({ pollId: poll.id, optionId: yes }))).toEqual({ ok: true });
    }
    await signIn(setup.outside.bo);
    expect(await vote(undefined, formData({ pollId: poll.id, optionId: yes }))).toEqual({ ok: false, error: "Afstemningen findes ikke." });
    expect(await prisma.pollBallot.count({ where: { pollId: poll.id } })).toBe(2);

    const view = (await feedPosts(setup.second.team.id, { id: setup.second.bo.id, canAdminister: true }))[0]!.poll!;
    expect(view.ballots).toBe(2);
    // A team's admin may not close a club's poll; the club's admin may.
    expect(view.canClose).toBe(false);
    expect((await feedPosts(setup.first.team.id, { id: setup.first.bo.id, canAdminister: false, canAdministerClub: true }))[0]!.poll!.canClose).toBe(true);
    await signIn(setup.second.admin);
    expect(await closePoll(undefined, formData({ pollId: poll.id }))).toEqual({ ok: false, error: "Det er ikke din afstemning." });
    await signIn(setup.clubAdmin);
    expect(await closePoll(undefined, formData({ pollId: poll.id }))).toEqual({ ok: true });
  });

  it("shows its pictures to everybody on its teams, and to nobody else", async () => {
    const setup = await club();
    const photo = await makePhoto(setup.first.team.id);
    await clubPost(setup, { [PHOTO_FIELD]: photo.id });
    await signIn(setup.second.bo);
    expect((await fetchPhoto(photo.id)).status).toBe(200);
    await signIn(setup.third.bo);
    expect((await fetchPhoto(photo.id)).status).toBe(404);
    await signIn(setup.outside.bo);
    expect((await fetchPhoto(photo.id)).status).toBe(404);
  });
});

describe("a club activity", () => {
  const future = "2030-06-01T10:00";

  async function clubActivity(setup: Awaited<ReturnType<typeof club>>, teams = [setup.first.team.id, setup.second.team.id]) {
    await signIn(setup.clubAdmin);
    const where = await captureRedirect(() =>
      saveClubActivity(undefined, formData({ title: "Klubdag", startsAt: future, location: "Klubhuset", teamId: teams })),
    );
    const activity = await prisma.match.findFirstOrThrow({ where: { clubId: setup.club.id } });
    expect(where).toBe(`/aktiviteter/${activity.id}`);
    return activity;
  }

  it("is shared with the teams chosen, who hear of it, and found by nobody else", async () => {
    const setup = await club();
    const activity = await clubActivity(setup);
    expect(activity).toMatchObject({ teamId: null, kind: "OTHER", source: "MANUAL", title: "Klubdag", location: "Klubhuset" });
    expect((await notices(setup.second.bo.id))[0]).toMatchObject({
      teamId: setup.second.team.id,
      category: "ACTIVITIES",
      title: "Ny klubaktivitet fra Swingkings FC 📅",
      matchId: activity.id,
    });
    expect(await notices(setup.third.bo.id)).toHaveLength(0);
    expect(await findActivitySeenBy(setup.second.team.id, activity.id, { id: true })).toEqual({ id: activity.id });
    expect(await findActivitySeenBy(setup.third.team.id, activity.id, { id: true })).toBeNull();
    expect(await findActivitySeenBy(setup.outside.team.id, activity.id, { id: true })).toBeNull();
    expect(await reachDb(setup.first.team.id).match.count()).toBe(1);
    expect(await teamDb(setup.first.team.id).match.count()).toBe(0);
  });

  it("is made by the club's admins only", async () => {
    const setup = await club();
    for (const who of [setup.first.bo, setup.first.admin]) {
      await signIn(who);
      await expectDenied(() => saveClubActivity(undefined, formData({ title: "Klubdag", startsAt: future, teamId: [setup.first.team.id] })));
    }
    await signIn(setup.clubAdmin);
    expect(await saveClubActivity(undefined, formData({ title: "Klubdag", startsAt: future, teamId: [setup.outside.team.id] }))).toEqual({
      ok: false,
      error: "Vælg de hold, aktiviteten skal ud til.",
    });
    expect(await saveClubActivity(undefined, formData({ title: "", startsAt: future, teamId: [setup.first.team.id] }))).toMatchObject({ ok: false });
    expect(await prisma.match.count()).toBe(0);
  });

  it("takes sign-ups and comments from every team it is shared with, on the same activity", async () => {
    const setup = await club();
    const activity = await clubActivity(setup);
    await signIn(setup.first.bo);
    expect(await setSignup(undefined, formData({ activityId: activity.id, going: "yes" }))).toEqual({ ok: true });
    expect(await addActivityComment(undefined, formData({ matchId: activity.id, body: "Jeg tager grillen" }))).toEqual({ ok: true });
    const comment = await prisma.activityComment.findFirstOrThrow();
    await signIn(setup.second.bo);
    expect(await setSignup(undefined, formData({ activityId: activity.id, going: "no" }))).toEqual({ ok: true });
    expect(await addActivityComment(undefined, formData({ matchId: activity.id, parentId: comment.id, body: "Super" }))).toEqual({ ok: true });
    expect(await react(undefined, formData({ target: "activityComment", id: comment.id, kind: "THUMBS", on: "on" }))).toEqual({ ok: true });

    expect(await prisma.activitySignup.findMany({ where: { matchId: activity.id }, orderBy: { going: "desc" }, select: { teamId: true, going: true } })).toEqual([
      { teamId: setup.first.team.id, going: true },
      { teamId: setup.second.team.id, going: false },
    ]);
    // The one answered hears of it on his own team; nobody else on the club's teams is told of a comment.
    expect((await notices(setup.first.bo.id)).filter((n) => n.category === "COMMENTS")).toMatchObject([{ teamId: setup.first.team.id }]);
    expect((await notices(setup.first.admin.id)).filter((n) => n.category === "COMMENTS")).toHaveLength(0);

    for (const who of [setup.third.bo, setup.outside.bo]) {
      await signIn(who);
      expect(await setSignup(undefined, formData({ activityId: activity.id, going: "yes" }))).toEqual({ ok: false, error: "Aktiviteten findes ikke." });
      expect(await addActivityComment(undefined, formData({ matchId: activity.id, body: "Hej" }))).toEqual({ ok: false, error: "Aktiviteten findes ikke." });
      expect(await react(undefined, formData({ target: "activityComment", id: comment.id, kind: "THUMBS", on: "on" }))).toMatchObject({ ok: false });
    }

    // A team's admin tidies what was written from the team; the club's admins all of it.
    const answer = await prisma.activityComment.findFirstOrThrow({ where: { parentId: comment.id } });
    await signIn(setup.first.admin);
    expect(await deleteActivityComment(undefined, formData({ id: answer.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    await signIn(setup.clubAdmin);
    expect(await deleteActivityComment(undefined, formData({ id: answer.id }))).toEqual({ ok: true });
    await signIn(setup.first.admin);
    expect(await deleteActivityComment(undefined, formData({ id: comment.id }))).toEqual({ ok: true });
    expect(await prisma.activityComment.count()).toBe(0);
  });

  it("carries each team's own jobs", async () => {
    const setup = await club();
    const activity = await clubActivity(setup);
    await signIn(setup.first.bo);
    expect(await createTask(undefined, formData({ title: "Grill", matchId: activity.id, assign: "pick", assigneeId: [setup.first.bo.id] }))).toEqual({ ok: true });
    await signIn(setup.second.bo);
    expect(await createTask(undefined, formData({ title: "Kage", matchId: activity.id, assign: "pick", assigneeId: [setup.second.bo.id] }))).toEqual({ ok: true });
    await signIn(setup.outside.bo);
    expect(await createTask(undefined, formData({ title: "Snyd", matchId: activity.id, assign: "pick", assigneeId: [setup.outside.bo.id] }))).toMatchObject({ ok: false });
    expect((await teamDb(setup.first.team.id).task.findMany({ where: { matchId: activity.id } })).map((t) => t.title)).toEqual(["Grill"]);
    expect((await teamDb(setup.second.team.id).task.findMany({ where: { matchId: activity.id } })).map((t) => t.title)).toEqual(["Kage"]);
  });

  it("is changed by the club's admins: moved, and taken from a team with what that team had on it", async () => {
    const setup = await club();
    const activity = await clubActivity(setup);
    await signIn(setup.second.bo);
    await setSignup(undefined, formData({ activityId: activity.id, going: "yes" }));
    await createTask(undefined, formData({ title: "Kage", matchId: activity.id, assign: "pick", assigneeId: [setup.second.bo.id] }));
    await signIn(setup.first.bo);
    await createTask(undefined, formData({ title: "Grill", matchId: activity.id, assign: "pick", assigneeId: [setup.first.bo.id] }));
    const grill = await prisma.task.findFirstOrThrow({ where: { title: "Grill" } });

    await signIn(setup.first.admin);
    await expectDenied(() => saveClubActivity(undefined, formData({ id: activity.id, title: "X", startsAt: future, teamId: [setup.first.team.id] })));

    await signIn(setup.clubAdmin);
    expect(
      await saveClubActivity(
        undefined,
        formData({ id: activity.id, title: "Klubdag", startsAt: "2030-06-01T12:00", teamId: [setup.first.team.id, setup.third.team.id] }),
      ),
    ).toEqual({ ok: true });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: activity.id } })).startsAt.toISOString()).toBe("2030-06-01T10:00:00.000Z");
    // The second team lost it, with its sign-ups and jobs; the third gained it and hears of it.
    expect(await findActivitySeenBy(setup.second.team.id, activity.id, { id: true })).toBeNull();
    expect(await prisma.activitySignup.count()).toBe(0);
    expect(await prisma.task.findMany({ select: { title: true } })).toEqual([{ title: "Grill" }]);
    // The first team's job kept its distance to the start: two hours later.
    expect((await prisma.task.findUniqueOrThrow({ where: { id: grill.id } })).dueAt!.getTime() - grill.dueAt!.getTime()).toBe(2 * 3600_000);
    expect((await notices(setup.third.bo.id)).map((n) => n.title)).toEqual(["Ny klubaktivitet fra Swingkings FC 📅"]);
    expect((await notices(setup.first.bo.id)).map((n) => n.title)).toContain("Aktiviteten er flyttet 📅");

    // Another club's activity is not this club admin's.
    const other = await prisma.club.create({ data: { name: "Anden klub" } });
    const theirs = await prisma.match.create({ data: { clubId: other.id, title: "Deres", startsAt: new Date(Date.now() + 864e5) } });
    expect(await saveClubActivity(undefined, formData({ id: theirs.id, title: "X", startsAt: future, teamId: [setup.first.team.id] }))).toEqual({
      ok: false,
      error: "Aktiviteten findes ikke længere.",
    });
    expect(await deleteClubActivity(undefined, formData({ id: theirs.id }))).toEqual({ ok: true });
    expect(await prisma.match.count({ where: { id: theirs.id } })).toBe(1);
  });

  it("is deleted for every team by the club's admins, with everything on it", async () => {
    const setup = await club();
    const activity = await clubActivity(setup);
    await signIn(setup.first.bo);
    await setSignup(undefined, formData({ activityId: activity.id, going: "yes" }));
    await createTask(undefined, formData({ title: "Grill", matchId: activity.id, assign: "pick", assigneeId: [setup.first.bo.id] }));
    await signIn(setup.first.admin);
    await expectDenied(() => deleteClubActivity(undefined, formData({ id: activity.id })));
    await signIn(setup.clubAdmin);
    await expectRedirect(() => deleteClubActivity(undefined, formData({ id: activity.id })), "/klub");
    expect(await prisma.match.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.activitySignup.count()).toBe(0);
  });

  it("stays when a team starts a new season, without the team's jobs, sign-ups and comments on it once held", async () => {
    const setup = await club();
    const past = await prisma.match.create({
      data: { clubId: setup.club.id, title: "Klubdag", startsAt: new Date(Date.now() - 2 * 864e5), teams: { create: [{ teamId: setup.first.team.id }, { teamId: setup.second.team.id }] } },
    });
    for (const s of [setup.first, setup.second]) {
      await prisma.activitySignup.create({ data: { teamId: s.team.id, matchId: past.id, userId: s.bo.id, going: true } });
      await prisma.task.create({ data: { teamId: s.team.id, matchId: past.id, title: "Grill", dueAt: past.startsAt } });
      await prisma.activityComment.create({ data: { teamId: s.team.id, matchId: past.id, authorId: s.bo.id, body: "Tak for i dag" } });
    }
    await signIn(setup.first.admin);
    await expectRedirect(() => startNewSeason(undefined, formData({ name: "Sæson 2026", confirm: "on" })), "/hold/saesoner");
    expect(await prisma.match.count({ where: { id: past.id } })).toBe(1);
    for (const model of ["activitySignup", "task", "activityComment"] as const) {
      expect(await (prisma[model] as typeof prisma.task).count({ where: { teamId: setup.first.team.id } })).toBe(0);
      expect(await (prisma[model] as typeof prisma.task).count({ where: { teamId: setup.second.team.id } })).toBe(1);
    }
  });
});

describe("leaving a club", () => {
  it("takes the club's posts and activities from the team, and the club admin role from those left on none of its teams", async () => {
    const setup = await club();
    const post = await clubPost(setup);
    const activity = await prisma.match.create({
      data: { clubId: setup.club.id, title: "Klubdag", startsAt: new Date(Date.now() + 864e5), teams: { create: [{ teamId: setup.first.team.id }, { teamId: setup.second.team.id }] } },
    });
    await prisma.activitySignup.create({ data: { teamId: setup.first.team.id, matchId: activity.id, userId: setup.first.bo.id, going: true } });
    await prisma.task.create({ data: { teamId: setup.first.team.id, matchId: activity.id, title: "Grill" } });

    await setTeamClub(setup.first.team.id, null);
    expect(await findActivitySeenBy(setup.first.team.id, activity.id, { id: true })).toBeNull();
    expect(await feedPosts(setup.first.team.id, { id: setup.first.bo.id, canAdminister: false })).toEqual([]);
    expect(await feedPosts(setup.second.team.id, { id: setup.second.bo.id, canAdminister: false })).toHaveLength(1);
    expect(await prisma.activitySignup.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    // Anna plays on none of the club's teams now.
    expect(await prisma.clubAdmin.count()).toBe(0);
    expect(post.id).toBeTruthy();
  });

  it("ends the club admin role of somebody taken off the club's last team they were on", async () => {
    const setup = await club();
    await joinTeam(setup.clubAdmin.id, setup.second.team.id);
    await signIn(setup.first.admin);
    expect(await removeMember(undefined, formData({ userId: setup.clubAdmin.id }))).toEqual({ ok: true });
    expect(await prisma.clubAdmin.count()).toBe(1);
    await signIn(setup.second.admin);
    expect(await removeMember(undefined, formData({ userId: setup.clubAdmin.id }))).toEqual({ ok: true });
    expect(await prisma.clubAdmin.count()).toBe(0);
    await pruneClubAdmins();
  });
});

describe("the club's reach", () => {
  it("is read-only, and only for activities, posts and polls", async () => {
    const { team } = await makeSquad();
    const db = reachDb(team.id) as unknown as { fine: { count: () => Promise<number> }; post: { deleteMany: () => Promise<unknown> } };
    await expect(db.fine.count()).rejects.toThrow("reachDb reads activities, posts and polls");
    await expect(db.post.deleteMany()).rejects.toThrow("reachDb only reads");
  });

  it("never finds another team's own post or activity", async () => {
    const mine = await makeSquad();
    const theirs = await makeSquad("Andre");
    const match = await makeMatch(theirs.team.id);
    expect(await findActivitySeenBy(mine.team.id, match.id, { id: true })).toBeNull();
    expect(await reachDb(mine.team.id).post.count()).toBe(0);
  });

  it("names each person's own team among several, the first they joined", async () => {
    const first = await makeSquad("Første");
    const second = await makeSquad("Anden");
    await joinTeam(first.anna.id, second.team.id);
    const late = await makeMember(second.team.id, "Sen");
    const home = await homeTeams([first.anna.id, late.id, first.bo.id], [second.team.id, first.team.id]);
    expect(home.get(first.anna.id)).toBe(first.team.id);
    expect(home.get(late.id)).toBe(second.team.id);
    expect(home.get(first.bo.id)).toBe(first.team.id);
  });

  it("lists everybody on several teams once, under the first team they joined", async () => {
    const first = await makeSquad("Første");
    const second = await makeSquad("Anden");
    await joinTeam(first.anna.id, second.team.id);
    const people = await rosterAcross([first.team.id, second.team.id]);
    // Two teams of four: Anna, on both, is listed once.
    expect(people).toHaveLength(8);
    expect(people.find((p) => p.userId === first.anna.id)).toMatchObject({ teamName: "Første" });
  });
});
