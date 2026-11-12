import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addComment,
  closePoll,
  createPost,
  deleteChatMessage,
  deleteComment,
  deletePost,
  sendChatMessage,
  toggleLike,
  vote,
} from "@/app/actions/social";
import { feedPosts } from "@/lib/feed";
import { CHAT_PAGE, latestMessages } from "@/lib/chat";
import { PHOTO_FIELD, formData, makeMatch, makePhoto, makePoll, makeSquad, signIn } from "../helpers/factories";
import { afterQueue } from "../helpers/next-mocks";
import { expectRedirectToLogin } from "../helpers/expect";

describe("chat", () => {
  it("posts a message and a picture, newest last", async () => {
    const { team, anna } = await makeSquad();
    const photo = await makePhoto(team.id);
    await signIn(anna);
    expect(await sendChatMessage(undefined, formData({ body: " Hej holdet " }))).toEqual({ ok: true });
    expect(await sendChatMessage(undefined, formData({ [PHOTO_FIELD]: photo.id }))).toEqual({ ok: true });
    const messages = await latestMessages(team.id);
    expect(messages.map((m) => [m.body, m.photoId])).toEqual([
      ["Hej holdet", null],
      ["", photo.id],
    ]);
    expect(typeof messages[0]!.createdAt).toBe("string");
  });

  it("refuses an empty message, an overlong one and another team's picture", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(anna);
    expect(await sendChatMessage(undefined, formData({ body: "  " }))).toEqual({ ok: false, error: "Skriv en besked eller vælg et billede." });
    expect((await sendChatMessage(undefined, formData({ body: "x".repeat(4001) })))?.ok).toBe(false);
    expect(await sendChatMessage(undefined, formData({ [PHOTO_FIELD]: (await makePhoto(other.team.id)).id }))).toEqual({
      ok: false,
      error: "Billedet findes ikke længere.",
    });
  });

  it("stops somebody sending 120 messages in a quarter of an hour", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    await prisma.loginAttempt.deleteMany();
    for (let i = 0; i < 120; i++) await sendChatMessage(undefined, formData({ body: `${i}` }));
    expect(await sendChatMessage(undefined, formData({ body: "en til" }))).toEqual({ ok: false, error: "Du sender meget hurtigt. Vent lidt." });
  }, 30_000);

  it("shows only the latest page, and only this team's", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await prisma.chatMessage.createMany({
      data: Array.from({ length: CHAT_PAGE + 5 }, (_, i) => ({ teamId: team.id, authorId: anna.id, body: `${i}`, createdAt: new Date(1_900_000_000_000 + i * 1000) })),
    });
    await prisma.chatMessage.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "fremmed" } });
    const messages = await latestMessages(team.id);
    expect(messages).toHaveLength(CHAT_PAGE);
    expect(messages.at(-1)!.body).toBe(`${CHAT_PAGE + 4}`);
    expect(messages.some((m) => m.body === "fremmed")).toBe(false);
  });

  it("deletes your own message and its picture; an admin may delete anybody's", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const photo = await makePhoto(team.id);
    const mine = await prisma.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "", photoId: photo.id } });
    const bos = await prisma.chatMessage.create({ data: { teamId: team.id, authorId: bo.id, body: "Bo" } });
    await signIn(anna);
    expect(await deleteChatMessage(undefined, formData({ id: bos.id }))).toEqual({ ok: false, error: "Det er ikke din besked." });
    await deleteChatMessage(undefined, formData({ id: mine.id }));
    expect(await prisma.photo.count()).toBe(0);
    await signIn(admin);
    await deleteChatMessage(undefined, formData({ id: bos.id }));
    expect(await prisma.chatMessage.count()).toBe(0);
  });
});

describe("feed posts", () => {
  it("posts up to ten pictures in the order chosen, with words", async () => {
    const { team, anna } = await makeSquad();
    const photos = await Promise.all([1, 2, 3].map(() => makePhoto(team.id)));
    const order = [photos[2]!.id, photos[0]!.id, photos[1]!.id];
    await signIn(anna);
    expect(await createPost(undefined, formData({ body: "Sejr!", [PHOTO_FIELD]: order }))).toEqual({ ok: true });
    const [post] = await feedPosts(team.id, { id: anna.id, canAdminister: false });
    expect(post).toMatchObject({ body: "Sejr!", photoIds: order, poll: null });
  });

  it("refuses an empty post, more than ten pictures and another team's", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(anna);
    expect(await createPost(undefined, formData({}))).toEqual({ ok: false, error: "Vælg billeder, skriv noget eller lav en afstemning." });
    const eleven = await Promise.all(Array.from({ length: 11 }, () => makePhoto(team.id)));
    expect(await createPost(undefined, formData({ [PHOTO_FIELD]: eleven.map((p) => p.id) }))).toEqual({ ok: false, error: "Højst 10 billeder pr. opslag." });
    expect(await createPost(undefined, formData({ [PHOTO_FIELD]: [(await makePhoto(other.team.id)).id] }))).toEqual({
      ok: false,
      error: "Et af billederne findes ikke længere.",
    });
  });

  it("deletes a post with its pictures; only the author or an admin", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const photo = await makePhoto(team.id);
    await signIn(anna);
    await createPost(undefined, formData({ body: "x", [PHOTO_FIELD]: [photo.id] }));
    const post = await prisma.post.findFirstOrThrow();
    await signIn(bo);
    expect(await deletePost(undefined, formData({ id: post.id }))).toEqual({ ok: false, error: "Det er ikke dit opslag." });
    await signIn(admin);
    expect(await deletePost(undefined, formData({ id: post.id }))).toEqual({ ok: true });
    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.photo.count()).toBe(0);
  });

  it("likes, unlikes, comments and deletes comments", async () => {
    const { team, anna, bo } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "x" } });
    await signIn(bo);
    await toggleLike(undefined, formData({ postId: post.id }));
    expect(await prisma.postLike.count()).toBe(1);
    await toggleLike(undefined, formData({ postId: post.id }));
    expect(await prisma.postLike.count()).toBe(0);

    expect(await addComment(undefined, formData({ postId: post.id, body: " " }))).toEqual({ ok: false, error: "Skriv en kommentar." });
    expect(await addComment(undefined, formData({ postId: post.id, body: "Flot!" }))).toEqual({ ok: true });
    const comment = await prisma.postComment.findFirstOrThrow();
    await signIn(anna);
    expect(await deleteComment(undefined, formData({ id: comment.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    await signIn(bo);
    await deleteComment(undefined, formData({ id: comment.id }));
    expect(await prisma.postComment.count()).toBe(0);
  });

  it("cannot like, comment on or delete another team's post", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "x" } });
    const comment = await prisma.postComment.create({ data: { postId: theirs.id, authorId: other.anna.id, body: "x" } });
    await signIn(anna);
    expect(await toggleLike(undefined, formData({ postId: theirs.id }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    expect(await addComment(undefined, formData({ postId: theirs.id, body: "x" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    await deleteComment(undefined, formData({ id: comment.id }));
    await deletePost(undefined, formData({ id: theirs.id }));
    expect(await prisma.post.count()).toBe(1);
    expect(await prisma.postComment.count()).toBe(1);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => createPost(undefined, formData({ body: "x" })));
  });
});

describe("polls", () => {
  const pollForm = (fields: Record<string, string | string[]>) =>
    formData({ withPoll: "on", pollQuestion: "Hvem var bedst?", ...fields });

  it("makes a poll of typed answers, cleaned, and fixed as anonymous", async () => {
    const { team, anna } = await makeSquad();
    const match = await makeMatch(team.id);
    await signIn(anna);
    expect(
      await createPost(undefined, pollForm({ pollOption: ["Fredag", " ", "fredag", "Lørdag"], pollAnonymous: "on", pollMultiple: "on", pollMatchId: match.id })),
    ).toEqual({ ok: true });
    const poll = await prisma.poll.findFirstOrThrow({ include: { options: { orderBy: { position: "asc" } } } });
    expect(poll).toMatchObject({ anonymous: true, multipleChoice: true, matchId: match.id });
    expect(poll.options.map((o) => o.text)).toEqual(["Fredag", "Lørdag"]);
  });

  it("makes a 'kampens spiller' poll with every player as an answer", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    await createPost(undefined, pollForm({ pollKind: "players" }));
    const options = await prisma.pollOption.findMany({ orderBy: { position: "asc" } });
    expect(options.map((o) => o.text)).toEqual(["Anna", "Bo", "Kasserer", "Træner"]);
    expect(options.every((o) => o.playerId)).toBe(true);
  });

  it("makes a poll of the players ticked on the roster, and refuses a player from another team", async () => {
    const { anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(anna);
    expect(await createPost(undefined, pollForm({ pollKind: "players", pollPickPlayers: "on", pollPlayerId: [bo.id, anna.id] }))).toEqual({ ok: true });
    const options = await prisma.pollOption.findMany({ orderBy: { position: "asc" } });
    expect(options.map((o) => [o.text, o.playerId])).toEqual([
      ["Anna", anna.id],
      ["Bo", bo.id],
    ]);

    expect(await createPost(undefined, pollForm({ pollKind: "players", pollPickPlayers: "on", pollPlayerId: [bo.id, other.anna.id] }))).toEqual({
      ok: false,
      error: "Spilleren er ikke på holdet.",
    });
    expect(await createPost(undefined, pollForm({ pollKind: "players", pollPickPlayers: "on", pollPlayerId: [bo.id] }))).toEqual({
      ok: false,
      error: "En afstemning skal have mindst to svarmuligheder.",
    });
    expect(await prisma.poll.count()).toBe(1);
  });

  it("refuses a poll with one answer, a past closing time and another team's match", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(anna);
    expect(await createPost(undefined, pollForm({ pollOption: ["Kun en"] }))).toEqual({ ok: false, error: "En afstemning skal have mindst to svarmuligheder." });
    expect(await createPost(undefined, pollForm({ pollOption: ["A", "B"], pollClosesAt: "2001-01-01T10:00" }))).toEqual({
      ok: false,
      error: "Sluttidspunktet skal ligge ude i fremtiden.",
    });
    expect(await createPost(undefined, pollForm({ pollOption: ["A", "B"], pollClosesAt: "snart" }))).toEqual({ ok: false, error: "Sluttidspunktet kunne ikke læses." });
    expect(await createPost(undefined, pollForm({ pollOption: ["A", "B"], pollMatchId: (await makeMatch(other.team.id)).id }))).toEqual({
      ok: false,
      error: "Kampen findes ikke.",
    });
    expect(await createPost(undefined, pollForm({ pollQuestion: "", pollOption: ["A", "B"] }))).toEqual({
      ok: false,
      error: "Skriv spørgsmålet til afstemningen.",
    });
    expect(await prisma.poll.count()).toBe(0);
  });

  it("hides the results until the viewer has voted, then names the voters of an open poll", async () => {
    const { team, anna, bo } = await makeSquad();
    const { poll, optionIds } = await makePoll(team.id, anna.id);
    await signIn(bo);
    expect(await vote(undefined, formData({ pollId: poll.id, optionId: optionIds[1]! }))).toEqual({ ok: true });

    const [forAnna] = await feedPosts(team.id, { id: anna.id, canAdminister: false });
    expect(forAnna!.poll).toMatchObject({ hasVoted: false, ballots: 1, canClose: true });
    expect(forAnna!.poll!.options.map((o) => [o.votes, o.voters.length])).toEqual([
      [0, 0],
      [0, 0],
    ]);

    const [forBo] = await feedPosts(team.id, { id: bo.id, canAdminister: false });
    expect(forBo!.poll).toMatchObject({ hasVoted: true, myChoices: [optionIds[1]], canClose: false });
    // Shown most votes first: the answer Bo picked has moved to the top.
    expect(forBo!.poll!.options.map((o) => o.id)).toEqual([optionIds[1], optionIds[0]]);
    expect(forBo!.poll!.options[0]).toMatchObject({ votes: 1, leading: true, voters: [{ id: bo.id, name: "Bo" }] });
  });

  it("never names a voter of an anonymous poll, even after it closes", async () => {
    const { team, anna, bo } = await makeSquad();
    const { poll, optionIds } = await makePoll(team.id, anna.id, { anonymous: true });
    await signIn(bo);
    await vote(undefined, formData({ pollId: poll.id, optionId: optionIds[0]! }));
    expect(await vote(undefined, formData({ pollId: poll.id, optionId: optionIds[1]! }))).toEqual({ ok: false, error: "Du har allerede stemt. En anonym stemme kan ikke ændres." });

    await signIn(anna);
    await closePoll(undefined, formData({ pollId: poll.id }));
    const [post] = await feedPosts(team.id, { id: anna.id, canAdminister: false });
    expect(post!.poll).toMatchObject({ open: false, myChoices: [] });
    expect(post!.poll!.options[0]).toMatchObject({ votes: 1, voters: [] });
    expect(await prisma.pollVote.findFirstOrThrow()).toMatchObject({ voterId: null });
  });

  it("lets only the maker or an admin close a poll", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const { poll } = await makePoll(team.id, anna.id);
    await signIn(bo);
    expect(await closePoll(undefined, formData({ pollId: poll.id }))).toEqual({ ok: false, error: "Det er ikke din afstemning." });
    await signIn(admin);
    expect(await closePoll(undefined, formData({ pollId: poll.id }))).toEqual({ ok: true });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).closedAt).not.toBeNull();
    expect(await closePoll(undefined, formData({ pollId: "findes-ikke" }))).toEqual({ ok: false, error: "Afstemningen findes ikke." });
  });

  it("cannot vote in another team's poll", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const { poll, optionIds } = await makePoll(other.team.id, other.anna.id);
    await signIn(anna);
    expect(await vote(undefined, formData({ pollId: poll.id, optionId: optionIds[0]! }))).toEqual({ ok: false, error: "Afstemningen findes ikke." });
    expect(await closePoll(undefined, formData({ pollId: poll.id }))).toEqual({ ok: false, error: "Afstemningen findes ikke." });
  });
});

describe("after the response", () => {
  it("queues a push for the team when keys are configured, and nothing without them", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    await sendChatMessage(undefined, formData({ body: "uden nøgler" }));
    expect(afterQueue).toHaveLength(0);

    process.env.VAPID_PRIVATE_KEY = "test";
    try {
      await sendChatMessage(undefined, formData({ body: "med nøgler" }));
      expect(afterQueue).toHaveLength(1);
    } finally {
      delete process.env.VAPID_PRIVATE_KEY;
    }
  });
});
