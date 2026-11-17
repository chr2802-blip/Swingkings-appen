import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What reaches the push service is recorded here instead of being sent.
const pushed = vi.hoisted(() => [] as { to: string[]; payload: { title: string; body: string; url?: string; tag?: string } }[]);
vi.mock("@/lib/push", () => ({
  sendPushToUsers: async (to: string[], payload: (typeof pushed)[number]["payload"]) => {
    pushed.push({ to, payload });
    return to.length;
  },
}));

import { prisma } from "@/lib/prisma";
import { addComment, deleteComment } from "@/app/actions/social";
import { feedPosts } from "@/lib/feed";
import { formData, makeSquad, signIn } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";

beforeEach(() => {
  process.env.VAPID_PRIVATE_KEY = "test";
});
afterEach(() => {
  delete process.env.VAPID_PRIVATE_KEY;
  pushed.length = 0;
});

async function thread() {
  const squad = await makeSquad();
  const { team, admin, anna } = squad;
  const post = await prisma.post.create({ data: { teamId: team.id, authorId: admin.id, body: "Kampen i går" } });
  // The post's author has a phone with notifications on: their comment pushes are grouped
  // (`src/lib/grouped-push.ts`), and go only where there is a device to hear them.
  await prisma.pushSubscription.create({ data: { userId: admin.id, endpoint: "https://fcm.googleapis.com/fcm/send/admin", p256dh: "B".repeat(87), auth: "a".repeat(22) } });
  const comment = await prisma.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Flot sejr" } });
  return { ...squad, post, comment };
}

describe("answering a comment", () => {
  it("places the answer under the comment and tells its writer, though not named, and the post's author", async () => {
    const { team, admin, anna, bo, post, comment } = await thread();
    await signIn(bo);
    expect(await addComment(undefined, formData({ postId: post.id, parentId: comment.id, body: "Enig!" }))).toEqual({ ok: true });
    await runAfter();

    const reply = await prisma.postComment.findFirstOrThrow({ where: { body: "Enig!" } });
    expect(reply.parentId).toBe(comment.id);
    expect(pushed).toEqual([
      { to: [anna.id], payload: { title: "Bo svarede på din kommentar", body: "Enig!", url: "/oversigt#feed", notificationId: expect.any(String) } },
      // Anna's comment was not news to the author yet either: both are counted.
      {
        to: [admin.id],
        payload: { title: "2 nye kommentarer på dit opslag", body: "Bo og Anna\nBo: Enig!", url: "/oversigt#feed", tag: `comments-${post.id}`, quiet: false },
      },
    ]);

    const [read] = await feedPosts(team.id, { id: bo.id, canAdminister: false });
    expect(read!.comments.map((c) => [c.body, c.parentId])).toEqual([
      ["Flot sejr", null],
      ["Enig!", comment.id],
    ]);
  });

  it("puts an answer to an answer under the first comment, and tells both writers once each", async () => {
    const { admin, anna, bo, treasurer, post, comment } = await thread();
    const answer = await prisma.postComment.create({ data: { postId: post.id, authorId: bo.id, body: "Enig", parentId: comment.id } });
    await signIn(treasurer);
    expect(await addComment(undefined, formData({ postId: post.id, parentId: answer.id, body: "Også mig" }))).toEqual({ ok: true });
    await runAfter();

    expect((await prisma.postComment.findFirstOrThrow({ where: { body: "Også mig" } })).parentId).toBe(comment.id);
    // One push each, carrying each one's own notification in the center.
    const answered = { title: "Kasserer svarede på din kommentar", body: "Også mig", url: "/oversigt#feed", notificationId: expect.any(String) };
    expect(pushed.slice(0, 2)).toEqual(expect.arrayContaining([{ to: [bo.id], payload: answered }, { to: [anna.id], payload: answered }]));
    expect(pushed.slice(2)).toEqual([
      {
        to: [admin.id],
        payload: {
          title: "3 nye kommentarer på dit opslag",
          body: "Kasserer, Bo og Anna\nKasserer: Også mig",
          url: "/oversigt#feed",
          tag: `comments-${post.id}`,
          quiet: false,
        },
      },
    ]);
  });

  it("tells the post's author only once when it is their comment being answered, and nobody of their own answer", async () => {
    const { admin, anna, post } = await thread();
    const own = await prisma.postComment.create({ data: { postId: post.id, authorId: admin.id, body: "Tak" } });
    await signIn(anna);
    await addComment(undefined, formData({ postId: post.id, parentId: own.id, body: "Selv tak" }));
    await runAfter();
    expect(pushed).toEqual([
      { to: [admin.id], payload: { title: "Anna svarede på din kommentar", body: "Selv tak", url: "/oversigt#feed", notificationId: expect.any(String) } },
    ]);

    pushed.length = 0;
    await signIn(admin);
    await addComment(undefined, formData({ postId: post.id, parentId: own.id, body: "Godt" }));
    await runAfter();
    // Anna wrote in the thread but was not answered; the admin is not told of their own words.
    expect(pushed).toEqual([]);
  });

  it("refuses to answer a comment on another post or another team's comment", async () => {
    const { team, anna, bo, post } = await thread();
    const elsewhere = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Andet" } });
    const there = await prisma.postComment.create({ data: { postId: elsewhere.id, authorId: anna.id, body: "Her" } });
    const other = await makeSquad("Andre");
    const theirPost = await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "x" } });
    const theirs = await prisma.postComment.create({ data: { postId: theirPost.id, authorId: other.anna.id, body: "x" } });

    await signIn(bo);
    const missing = { ok: false, error: "Kommentaren findes ikke længere." };
    expect(await addComment(undefined, formData({ postId: post.id, parentId: there.id, body: "Svar" }))).toEqual(missing);
    expect(await addComment(undefined, formData({ postId: post.id, parentId: theirs.id, body: "Svar" }))).toEqual(missing);
    expect(await addComment(undefined, formData({ postId: theirPost.id, parentId: theirs.id, body: "Svar" }))).toEqual({
      ok: false,
      error: "Opslaget findes ikke.",
    });
    expect(await prisma.postComment.count({ where: { body: "Svar" } })).toBe(0);
    await runAfter();
    expect(pushed).toEqual([]);
  });

  it("takes the answers with it when a comment is deleted, and keeps the comment when only an answer is", async () => {
    const { anna, bo, post, comment } = await thread();
    const answer = await prisma.postComment.create({ data: { postId: post.id, authorId: bo.id, body: "Enig", parentId: comment.id } });
    await signIn(anna);
    expect(await deleteComment(undefined, formData({ id: answer.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    await signIn(bo);
    await deleteComment(undefined, formData({ id: answer.id }));
    expect(await prisma.postComment.count()).toBe(1);

    await prisma.postComment.create({ data: { postId: post.id, authorId: bo.id, body: "Igen", parentId: comment.id } });
    await signIn(anna);
    await deleteComment(undefined, formData({ id: comment.id }));
    expect(await prisma.postComment.count()).toBe(0);
  });
});
