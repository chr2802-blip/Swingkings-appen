import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { react } from "@/app/actions/reactions";
import { latestMessages } from "@/lib/chat";
import { formData, makeMatch, makeSquad, signIn } from "../helpers/factories";
import { expectRedirectToLogin } from "../helpers/expect";

/** One of each thing a reaction can be on, all on one team. */
async function things(team: { id: string }, author: { id: string }) {
  const post = await prisma.post.create({ data: { teamId: team.id, authorId: author.id, body: "Opslag" } });
  const comment = await prisma.postComment.create({ data: { postId: post.id, authorId: author.id, body: "Kommentar" } });
  const message = await prisma.chatMessage.create({ data: { teamId: team.id, authorId: author.id, body: "Besked" } });
  const match = await makeMatch(team.id);
  const activityComment = await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: author.id, body: "Aktivitet" } });
  return { post, comment, message, match, activityComment };
}

describe("react", () => {
  it("gives and takes back a reaction on a post, a comment, a chat message and an activity comment", async () => {
    const { team, anna, bo } = await makeSquad();
    const t = await things(team, anna);
    await signIn(bo);
    const targets = [
      ["post", t.post.id, "postId"],
      ["comment", t.comment.id, "postCommentId"],
      ["chat", t.message.id, "chatMessageId"],
      ["activityComment", t.activityComment.id, "activityCommentId"],
    ] as const;
    for (const [target, id, column] of targets) {
      expect(await react(undefined, formData({ target, id, kind: "FIRE", on: "on" }))).toEqual({ ok: true });
      expect(await prisma.reaction.findMany({ where: { [column]: id }, select: { teamId: true, userId: true, kind: true } })).toEqual([
        { teamId: team.id, userId: bo.id, kind: "FIRE" },
      ]);
    }
    for (const [target, id, column] of targets) {
      expect(await react(undefined, formData({ target, id, kind: "FIRE", on: "off" }))).toEqual({ ok: true });
      expect(await prisma.reaction.count({ where: { [column]: id } })).toBe(0);
    }
  });

  it("gives each person one reaction on a thing: a new choice takes the place of the old", async () => {
    const { team, anna, bo } = await makeSquad();
    const { post } = await things(team, anna);
    const mine = () => prisma.reaction.findMany({ where: { postId: post.id }, select: { userId: true, kind: true }, orderBy: { userId: "asc" } });
    await signIn(bo);
    expect(await react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "on" }))).toEqual({ ok: true });
    expect(await react(undefined, formData({ target: "post", id: post.id, kind: "LAUGH", on: "on" }))).toEqual({ ok: true });
    await signIn(anna);
    await react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "on" }));
    expect(await mine()).toEqual(
      [
        { userId: bo.id, kind: "LAUGH" },
        { userId: anna.id, kind: "CROWN" },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );

    // A late "off" for the reaction Bo had before leaves the one he has now.
    await signIn(bo);
    await react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "off" }));
    expect((await mine()).find((r) => r.userId === bo.id)?.kind).toBe("LAUGH");
    await react(undefined, formData({ target: "post", id: post.id, kind: "LAUGH", on: "off" }));
    expect(await mine()).toEqual([{ userId: anna.id, kind: "CROWN" }]);
  });

  it("leaves one reaction when a person presses twice at once, the same one or two different ones", async () => {
    const { team, anna, bo } = await makeSquad();
    const { post, message } = await things(team, anna);
    await signIn(bo);
    await Promise.all([
      react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "on" })),
      react(undefined, formData({ target: "post", id: post.id, kind: "CROWN", on: "on" })),
      react(undefined, formData({ target: "chat", id: message.id, kind: "HEART", on: "on" })),
      react(undefined, formData({ target: "chat", id: message.id, kind: "FIRE", on: "on" })),
    ]);
    expect(await prisma.reaction.count({ where: { postId: post.id } })).toBe(1);
    expect(await prisma.reaction.count({ where: { chatMessageId: message.id } })).toBe(1);
  });

  it("refuses, in the database, a second reaction by the same person on a thing", async () => {
    const { team, anna } = await makeSquad();
    const { post } = await things(team, anna);
    await prisma.reaction.create({ data: { teamId: team.id, userId: anna.id, kind: "CROWN", postId: post.id } });
    await expect(prisma.reaction.create({ data: { teamId: team.id, userId: anna.id, kind: "HEART", postId: post.id } })).rejects.toThrow();
  });

  it("lets every role react", async () => {
    const { team, anna, treasurer, admin } = await makeSquad();
    const { message } = await things(team, anna);
    for (const user of [anna, treasurer, admin]) {
      await signIn(user);
      expect(await react(undefined, formData({ target: "chat", id: message.id, kind: "THUMBS", on: "on" }))).toEqual({ ok: true });
    }
    expect(await prisma.reaction.count()).toBe(3);
  });

  it("finds nothing of another team's: post, comment, chat message or activity comment", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const t = await things(other.team, other.anna);
    await signIn(anna);
    for (const [target, id] of [
      ["post", t.post.id],
      ["comment", t.comment.id],
      ["chat", t.message.id],
      ["activityComment", t.activityComment.id],
    ] as const) {
      expect(await react(undefined, formData({ target, id, kind: "HEART", on: "on" }))).toEqual({ ok: false, error: "Det findes ikke længere." });
    }
    expect(await prisma.reaction.count()).toBe(0);
  });

  it("refuses an unknown kind, an unknown target and a missing id", async () => {
    const { team, anna } = await makeSquad();
    const { post } = await things(team, anna);
    await signIn(anna);
    expect(await react(undefined, formData({ target: "post", id: post.id, kind: "ANGRY", on: "on" }))).toEqual({ ok: false, error: "Den reaktion findes ikke." });
    expect(await react(undefined, formData({ target: "fine", id: post.id, kind: "HEART", on: "on" }))).toEqual({ ok: false, error: "Det kan man ikke reagere på." });
    expect(await react(undefined, formData({ target: "post", id: "", kind: "HEART", on: "on" }))).toEqual({ ok: false, error: "Det findes ikke længere." });
    // The id of one kind of thing is not found as another.
    expect(await react(undefined, formData({ target: "chat", id: post.id, kind: "HEART", on: "on" }))).toEqual({ ok: false, error: "Det findes ikke længere." });
    expect(await prisma.reaction.count()).toBe(0);
  });

  it("goes with the thing it is on", async () => {
    const { team, anna } = await makeSquad();
    const t = await things(team, anna);
    await signIn(anna);
    for (const [target, id] of [
      ["post", t.post.id],
      ["comment", t.comment.id],
      ["chat", t.message.id],
      ["activityComment", t.activityComment.id],
    ] as const) {
      await react(undefined, formData({ target, id, kind: "WOW", on: "on" }));
    }
    await prisma.chatMessage.delete({ where: { id: t.message.id } });
    expect(await prisma.reaction.count()).toBe(3);
    await prisma.match.delete({ where: { id: t.match.id } });
    expect(await prisma.reaction.count()).toBe(2);
    await prisma.post.delete({ where: { id: t.post.id } });
    expect(await prisma.reaction.count()).toBe(0);
  });

  it("refuses, in the database, a reaction on nothing or on two things at once", async () => {
    const { team, anna } = await makeSquad();
    const t = await things(team, anna);
    await expect(prisma.reaction.create({ data: { teamId: team.id, userId: anna.id, kind: "SAD" } })).rejects.toThrow();
    await expect(
      prisma.reaction.create({ data: { teamId: team.id, userId: anna.id, kind: "SAD", postId: t.post.id, chatMessageId: t.message.id } }),
    ).rejects.toThrow();
  });

  it("shows the chat's reactions to the viewer, with theirs marked", async () => {
    const { team, anna, bo } = await makeSquad();
    const { message } = await things(team, anna);
    await prisma.reaction.createMany({
      data: [
        { teamId: team.id, chatMessageId: message.id, userId: bo.id, kind: "LAUGH" },
        { teamId: team.id, chatMessageId: message.id, userId: anna.id, kind: "LAUGH" },
      ],
    });
    const [forBo] = await latestMessages(team.id, bo.id);
    expect(forBo!.reactions).toEqual([{ kind: "LAUGH", emoji: "😂", label: "Griner", count: 2, mine: true, names: [bo.name, anna.name] }]);
    const [forAdmin] = await latestMessages(team.id, "somebody-else");
    expect(forAdmin!.reactions[0]!.mine).toBe(false);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => react(undefined, formData({ target: "post", id: "x", kind: "HEART", on: "on" })));
  });
});
