import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addComment,
  closePoll,
  createPost,
  deleteChatMessage,
  deleteComment,
  deletePost,
  editPost,
  pinPost,
  sendChatMessage,
  showPollResults,
  vote,
} from "@/app/actions/social";
import { feedPosts } from "@/lib/feed";
import { CHAT_PAGE, latestMessages, olderMessages } from "@/lib/chat";
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
    const { messages } = await latestMessages(team.id, anna.id);
    expect(messages.map((m) => [m.body, m.photoIds])).toEqual([
      ["Hej holdet", []],
      ["", [photo.id]],
    ]);
    expect(typeof messages[0]!.createdAt).toBe("string");
  });

  it("answers a message, quoted above the answer; another team's message cannot be answered", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const asked = await prisma.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "Hvem kører?" } });
    const theirs = await prisma.chatMessage.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "Hemmeligt" } });
    await signIn(bo);
    expect(await sendChatMessage(undefined, formData({ body: "Jeg kan", replyToId: asked.id }))).toEqual({ ok: true });
    expect(await sendChatMessage(undefined, formData({ body: "Kapret", replyToId: theirs.id }))).toEqual({
      ok: false,
      error: "Beskeden, du svarer på, findes ikke længere.",
    });
    const { messages } = await latestMessages(team.id, bo.id);
    expect(messages.map((m) => [m.body, m.replyTo])).toEqual([
      ["Hvem kører?", null],
      ["Jeg kan", { id: asked.id, authorName: anna.name, body: "Hvem kører?", photo: false }],
    ]);

    // The answered message deleted, the answer stays without its quote.
    await signIn(anna);
    await deleteChatMessage(undefined, formData({ id: asked.id }));
    const after = await latestMessages(team.id, bo.id);
    expect(after.messages.map((m) => [m.body, m.replyTo])).toEqual([["Jeg kan", null]]);
  });

  it("sends several pictures in one message, in the order chosen, with words or without", async () => {
    const { team, anna } = await makeSquad();
    const [a, b, c] = [await makePhoto(team.id), await makePhoto(team.id), await makePhoto(team.id)];
    await signIn(anna);
    expect(await sendChatMessage(undefined, formData({ body: "Fra kampen", [PHOTO_FIELD]: [c.id, a.id, b.id] }))).toEqual({ ok: true });
    const [message] = (await latestMessages(team.id, anna.id)).messages;
    expect(message).toMatchObject({ body: "Fra kampen", photoIds: [c.id, a.id, b.id] });
    expect(await prisma.chatMessage.count()).toBe(1);
  });

  it("refuses more than ten pictures, and a picture already in another message", async () => {
    const { team, anna } = await makeSquad();
    const eleven = await Promise.all(Array.from({ length: 11 }, () => makePhoto(team.id)));
    await signIn(anna);
    expect(await sendChatMessage(undefined, formData({ [PHOTO_FIELD]: eleven.map((p) => p.id) }))).toEqual({
      ok: false,
      error: "Højst 10 billeder pr. besked.",
    });
    expect(await sendChatMessage(undefined, formData({ [PHOTO_FIELD]: [eleven[0]!.id] }))).toEqual({ ok: true });
    expect(await sendChatMessage(undefined, formData({ [PHOTO_FIELD]: [eleven[1]!.id, eleven[0]!.id] }))).toEqual({
      ok: false,
      error: "Et af billederne findes ikke længere.",
    });
    expect(await prisma.chatMessage.count()).toBe(1);
  });

  it("refuses an empty message, an overlong one and another team's picture", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(anna);
    expect(await sendChatMessage(undefined, formData({ body: "  " }))).toEqual({ ok: false, error: "Skriv en besked eller vælg et billede." });
    expect((await sendChatMessage(undefined, formData({ body: "x".repeat(4001) })))?.ok).toBe(false);
    expect(await sendChatMessage(undefined, formData({ [PHOTO_FIELD]: (await makePhoto(other.team.id)).id }))).toEqual({
      ok: false,
      error: "Et af billederne findes ikke længere.",
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
    const { messages, more } = await latestMessages(team.id, anna.id);
    expect(CHAT_PAGE).toBe(25);
    expect(messages).toHaveLength(CHAT_PAGE);
    expect(messages[0]!.body).toBe("5");
    expect(messages.at(-1)!.body).toBe(`${CHAT_PAGE + 4}`);
    expect(more).toBe(true);
    expect(messages.some((m) => m.body === "fremmed")).toBe(false);
  });

  it("says there is nothing older when the whole chat fits on one page", async () => {
    const { team, anna } = await makeSquad();
    await prisma.chatMessage.createMany({
      data: Array.from({ length: CHAT_PAGE }, (_, i) => ({ teamId: team.id, authorId: anna.id, body: `${i}`, createdAt: new Date(1_900_000_000_000 + i * 1000) })),
    });
    expect(await latestMessages(team.id, anna.id)).toMatchObject({ more: false });
    expect((await latestMessages(team.id, anna.id)).messages).toHaveLength(CHAT_PAGE);
  });

  it("fetches the older pages one after the other, each oldest first, until the first message", async () => {
    const { team, anna } = await makeSquad();
    // Two of them at the very same moment: the id decides, and neither is skipped or shown twice.
    const at = (i: number) => new Date(1_900_000_000_000 + Math.min(i, 30) * 1000);
    await prisma.chatMessage.createMany({
      data: Array.from({ length: 2 * CHAT_PAGE + 3 }, (_, i) => ({ teamId: team.id, authorId: anna.id, body: `${i}`, createdAt: at(i) })),
    });
    const seen: string[] = [];
    let page = await latestMessages(team.id, anna.id);
    seen.unshift(...page.messages.map((m) => m.id));
    const pages = [page];
    while (page.more) {
      page = (await olderMessages(team.id, anna.id, page.messages[0]!.id))!;
      seen.unshift(...page.messages.map((m) => m.id));
      pages.push(page);
    }
    expect(pages.map((p) => p.messages.length)).toEqual([CHAT_PAGE, CHAT_PAGE, 3]);
    expect(pages.at(-1)!.more).toBe(false);
    expect(new Set(seen).size).toBe(2 * CHAT_PAGE + 3);
    const all = await prisma.chatMessage.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    expect(seen).toEqual(all.map((m) => m.id));
    expect(pages.at(-1)!.messages[0]!.body).toBe("0");
  });

  it("finds nothing before another team's message, or one that is gone", async () => {
    const { team } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.chatMessage.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "fremmed" } });
    expect(await olderMessages(team.id, "x", theirs.id)).toBeNull();
    expect(await olderMessages(team.id, "x", "findes-ikke")).toBeNull();
    expect(await olderMessages(other.team.id, other.anna.id, theirs.id)).toEqual({ messages: [], more: false });
  });

  it("deletes your own message and all its pictures; an admin may delete anybody's", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const [photo, second] = [await makePhoto(team.id), await makePhoto(team.id)];
    const mine = await prisma.chatMessage.create({
      data: {
        teamId: team.id,
        authorId: anna.id,
        body: "",
        photos: { create: [{ photoId: photo.id, position: 0 }, { photoId: second.id, position: 1 }] },
      },
    });
    const bos = await prisma.chatMessage.create({ data: { teamId: team.id, authorId: bo.id, body: "Bo" } });
    await signIn(anna);
    expect(await deleteChatMessage(undefined, formData({ id: bos.id }))).toEqual({ ok: false, error: "Det er ikke din besked." });
    await deleteChatMessage(undefined, formData({ id: mine.id }));
    expect(await prisma.photo.count()).toBe(0);
    expect(await prisma.chatPhoto.count()).toBe(0);
    await signIn(admin);
    await deleteChatMessage(undefined, formData({ id: bos.id }));
    expect(await prisma.chatMessage.count()).toBe(0);
  });

  it("leaves another team's message and its pictures alone", async () => {
    const { admin } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await makePhoto(other.team.id);
    const message = await prisma.chatMessage.create({
      data: { teamId: other.team.id, authorId: other.anna.id, body: "", photos: { create: { photoId: theirs.id, position: 0 } } },
    });
    await signIn(admin);
    await deleteChatMessage(undefined, formData({ id: message.id }));
    expect(await prisma.chatMessage.count({ where: { id: message.id } })).toBe(1);
    expect(await prisma.photo.count({ where: { id: theirs.id } })).toBe(1);
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

  it("edits a post's words and pictures: kept, taken off and added, in the order sent", async () => {
    const { team, anna } = await makeSquad();
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => makePhoto(team.id)));
    await signIn(anna);
    await createPost(undefined, formData({ body: "Sejr!", [PHOTO_FIELD]: [a!.id, b!.id] }));
    const post = await prisma.post.findFirstOrThrow();
    expect(post.editedAt).toBeNull();

    expect(await editPost(undefined, formData({ id: post.id, body: " Sejr 3-1! ", [PHOTO_FIELD]: [c!.id, a!.id] }))).toEqual({ ok: true });
    const [read] = await feedPosts(team.id, { id: anna.id, canAdminister: false });
    expect(read).toMatchObject({ body: "Sejr 3-1!", photoIds: [c!.id, a!.id] });
    expect(read!.editedAt).toBeInstanceOf(Date);
    expect(read!.createdAt).toEqual(post.createdAt);
    // The picture taken off belonged to nothing else and is gone.
    expect(await prisma.photo.findUnique({ where: { id: b!.id } })).toBeNull();
    expect(await prisma.photo.count()).toBe(2);
  });

  it("lets the author and an admin edit a post, and no other role", async () => {
    const { team, anna, bo, treasurer, admin } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Før" } });
    for (const other of [bo, treasurer]) {
      await signIn(other);
      expect(await editPost(undefined, formData({ id: post.id, body: "Kapret" }))).toEqual({ ok: false, error: "Det er ikke dit opslag." });
    }
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).body).toBe("Før");
    await signIn(admin);
    expect(await editPost(undefined, formData({ id: post.id, body: "Rettet af træneren" }))).toEqual({ ok: true });
    const after = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    // Still Anna's post.
    expect(after).toMatchObject({ body: "Rettet af træneren", authorId: anna.id });
  });

  it("refuses an edit that empties the post, is too long, or attaches a picture that is not free", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Før" } });
    const taken = await makePhoto(team.id);
    await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, photos: { create: { photoId: taken.id, position: 0 } } } });
    await signIn(anna);
    expect(await editPost(undefined, formData({ id: post.id, body: "  " }))).toEqual({ ok: false, error: "Et opslag skal have tekst eller billeder." });
    expect((await editPost(undefined, formData({ id: post.id, body: "x".repeat(4001) })))?.ok).toBe(false);
    const eleven = await Promise.all(Array.from({ length: 11 }, () => makePhoto(team.id)));
    expect(await editPost(undefined, formData({ id: post.id, [PHOTO_FIELD]: eleven.map((p) => p.id) }))).toEqual({ ok: false, error: "Højst 10 billeder pr. opslag." });
    // Another post's picture, and another team's.
    for (const id of [taken.id, (await makePhoto(other.team.id)).id]) {
      expect(await editPost(undefined, formData({ id: post.id, body: "x", [PHOTO_FIELD]: [id] }))).toEqual({ ok: false, error: "Et af billederne findes ikke længere." });
    }
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ body: "Før", editedAt: null });
    expect(await prisma.postPhoto.count({ where: { photoId: taken.id } })).toBe(1);
  });

  it("leaves a poll alone when its post is edited, and the post may then be only the poll", async () => {
    const { team, anna, bo } = await makeSquad();
    const { post, poll, optionIds } = await makePoll(team.id, anna.id);
    await signIn(bo);
    await vote(undefined, formData({ pollId: poll.id, optionId: optionIds[0]! }));
    await signIn(anna);
    expect(await editPost(undefined, formData({ id: post.id, body: "Husk at stemme" }))).toEqual({ ok: true });
    expect(await editPost(undefined, formData({ id: post.id, body: "" }))).toEqual({ ok: true });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).body).toBeNull();
    expect(await prisma.pollOption.count()).toBe(2);
    expect(await prisma.pollVote.count()).toBe(1);
  });

  it("lets every role pin and unpin anybody's post; pressing twice the same way changes nothing", async () => {
    const { team, anna, bo, treasurer, admin } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Vigtigt" } });
    const pinnedAt = async () => (await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).pinnedAt;
    for (const user of [bo, treasurer, admin, anna]) {
      await signIn(user);
      expect(await pinPost(undefined, formData({ id: post.id, pinned: "on" }))).toEqual({ ok: true });
      const first = await pinnedAt();
      expect(first).toBeInstanceOf(Date);
      expect(await pinPost(undefined, formData({ id: post.id, pinned: "on" }))).toEqual({ ok: true });
      expect(await pinnedAt()).toEqual(first);
      expect(await pinPost(undefined, formData({ id: post.id, pinned: "off" }))).toEqual({ ok: true });
      expect(await pinnedAt()).toBeNull();
    }
    // Pinning is not an edit.
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).editedAt).toBeNull();
  });

  it("comments and deletes comments", async () => {
    const { team, anna, bo } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "x" } });
    await signIn(bo);

    expect(await addComment(undefined, formData({ postId: post.id, body: " " }))).toEqual({ ok: false, error: "Skriv en kommentar." });
    expect(await addComment(undefined, formData({ postId: post.id, body: "Flot!" }))).toEqual({ ok: true });
    const comment = await prisma.postComment.findFirstOrThrow();
    await signIn(anna);
    expect(await deleteComment(undefined, formData({ id: comment.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    await signIn(bo);
    await deleteComment(undefined, formData({ id: comment.id }));
    expect(await prisma.postComment.count()).toBe(0);
  });

  it("reads who reacted to a post and to its comments with their picture, first to react first", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    const photo = await makePhoto(team.id);
    await prisma.user.update({ where: { id: bo.id }, data: { photoId: photo.id } });
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "x" } });
    const comment = await prisma.postComment.create({ data: { postId: post.id, authorId: bo.id, body: "y" } });
    await prisma.reaction.createMany({
      data: [
        { teamId: team.id, postId: post.id, userId: admin.id, kind: "FIRE", createdAt: new Date("2026-11-01T12:00:00Z") },
        { teamId: team.id, postId: post.id, userId: bo.id, kind: "HEART", createdAt: new Date("2026-11-01T10:00:00Z") },
        { teamId: team.id, postCommentId: comment.id, userId: anna.id, kind: "LAUGH" },
      ],
    });
    const [read] = await feedPosts(team.id, { id: anna.id, canAdminister: false });
    expect(read!.reactions).toEqual([
      { kind: "HEART", userId: bo.id, user: { name: bo.name, photoId: photo.id } },
      { kind: "FIRE", userId: admin.id, user: { name: admin.name, photoId: null } },
    ]);
    expect(read!.comments[0]!.reactions).toEqual([{ kind: "LAUGH", userId: anna.id, user: { name: anna.name, photoId: null } }]);
  });

  it("cannot comment on, edit, pin or delete another team's post", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "x" } });
    const comment = await prisma.postComment.create({ data: { postId: theirs.id, authorId: other.anna.id, body: "x" } });
    await signIn(anna);
    expect(await addComment(undefined, formData({ postId: theirs.id, body: "x" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    await deleteComment(undefined, formData({ id: comment.id }));
    await deletePost(undefined, formData({ id: theirs.id }));
    expect(await editPost(undefined, formData({ id: theirs.id, body: "Kapret" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    expect(await pinPost(undefined, formData({ id: theirs.id, pinned: "on" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    expect(await prisma.post.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ body: "x", pinnedAt: null, editedAt: null });
    expect(await prisma.post.count()).toBe(1);
    expect(await prisma.postComment.count()).toBe(1);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => createPost(undefined, formData({ body: "x" })));
    await expectRedirectToLogin(() => editPost(undefined, formData({ id: "x", body: "x" })));
    await expectRedirectToLogin(() => pinPost(undefined, formData({ id: "x", pinned: "on" })));
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

  it("keeps a hidden result from everybody until the maker shows it, and tells the team once", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    await signIn(anna);
    expect(await createPost(undefined, pollForm({ pollOption: ["Fredag", "Lørdag"], pollAnonymous: "on", pollHideResults: "on" }))).toEqual({ ok: true });
    const poll = await prisma.poll.findFirstOrThrow({ include: { options: { orderBy: { position: "asc" } } } });
    expect(poll).toMatchObject({ anonymous: true, hideResults: true, resultsShownAt: null });

    await signIn(bo);
    expect(await vote(undefined, formData({ pollId: poll.id, optionId: poll.options[1]!.id }))).toEqual({ ok: true });
    await signIn(anna);
    await closePoll(undefined, formData({ pollId: poll.id }));
    // Closed, voted and made by her — still nothing to see, not even for an admin.
    for (const viewer of [anna, bo, admin]) {
      const [post] = await feedPosts(team.id, { id: viewer.id, canAdminister: viewer === admin });
      expect(post!.poll).toMatchObject({ open: false, resultsHidden: true });
      expect(post!.poll!.options.every((o) => o.votes === 0)).toBe(true);
    }

    // Somebody else may not show it.
    await signIn(bo);
    expect(await showPollResults(undefined, formData({ pollId: poll.id }))).toEqual({ ok: false, error: "Det er ikke din afstemning." });

    await signIn(anna);
    const before = await prisma.notification.count();
    expect(await showPollResults(undefined, formData({ pollId: poll.id }))).toEqual({ ok: true });
    const shownAt = (await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).resultsShownAt;
    expect(shownAt).not.toBeNull();
    // The team hears of it — everybody but her — linked to the post.
    const told = await prisma.notification.findMany({ where: { title: "Resultatet er offentliggjort 🗳️" } });
    expect(told.length).toBe((await prisma.teamMember.count({ where: { teamId: team.id } })) - 1);
    expect(told.every((n) => n.postId === poll.postId && n.userId !== anna.id)).toBe(true);
    // A second press changes nothing and tells nobody again.
    expect(await showPollResults(undefined, formData({ pollId: poll.id }))).toEqual({ ok: true });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).resultsShownAt).toEqual(shownAt);
    expect(await prisma.notification.count()).toBe(before + told.length);

    const [post] = await feedPosts(team.id, { id: bo.id, canAdminister: false });
    expect(post!.poll).toMatchObject({ resultsHidden: false });
    expect(post!.poll!.options[0]).toMatchObject({ text: "Lørdag", votes: 1, voters: [] });
  });

  it("lets an admin show a hidden result, refuses one that was never hidden, and another team's", async () => {
    const { team, anna, admin } = await makeSquad();
    const { poll } = await makePoll(team.id, anna.id, { hideResults: true });
    const plain = await makePoll(team.id, anna.id);
    await signIn(admin);
    expect(await showPollResults(undefined, formData({ pollId: plain.poll.id }))).toEqual({ ok: false, error: "Resultatet er ikke skjult." });
    expect(await showPollResults(undefined, formData({ pollId: poll.id }))).toEqual({ ok: true });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).resultsShownAt).not.toBeNull();

    const other = await makeSquad("Andre");
    const theirs = await makePoll(other.team.id, other.anna.id, { hideResults: true });
    expect(await showPollResults(undefined, formData({ pollId: theirs.poll.id }))).toEqual({ ok: false, error: "Afstemningen findes ikke." });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: theirs.poll.id } })).resultsShownAt).toBeNull();
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
