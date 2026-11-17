import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { addComment } from "@/app/actions/social";
import { formData, makeMember, makeSquad, signIn } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";

// The push services are stood in for: who would get which notification is recorded.
const sent = vi.hoisted(() => [] as { to: string[]; title: string }[]);
vi.mock("@/lib/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/push")>()),
  sendPushToUsers: async (to: string[], payload: { title: string }) => void sent.push({ to: [...to].sort(), title: payload.title }),
}));

beforeEach(() => {
  sent.length = 0;
  process.env.VAPID_PRIVATE_KEY = "test";
});
afterEach(() => {
  delete process.env.VAPID_PRIVATE_KEY;
});

/** The post's author hears of comments through the grouped push, which needs a device to send to. */
const listening = (userId: string) =>
  prisma.pushSubscription.create({ data: { userId, endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`, p256dh: "B".repeat(87), auth: "a".repeat(22) } });

describe("tagging in a comment", () => {
  it("notifies the tagged teammates and the post's author, each once", async () => {
    const { team, anna, bo, treasurer } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr!" } });
    await listening(anna.id);
    await signIn(bo);
    expect(await addComment(undefined, formData({ postId: post.id, body: "@Kasserer @Kasserer så du det?" }))).toEqual({ ok: true });
    await runAfter();
    expect(sent).toEqual([
      { to: [treasurer.id], title: "Bo nævnte dig i en kommentar" },
      { to: [anna.id], title: "Bo kommenterede dit opslag" },
    ]);
  });

  it("tells a tagged author only that they were tagged, and never the writer", async () => {
    const { team, anna, bo } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr!" } });
    await listening(anna.id);
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "@Anna @Bo" }));
    await runAfter();
    expect(sent).toEqual([{ to: [anna.id], title: "Bo nævnte dig i en kommentar" }]);
  });

  it("in an answer, the answered hear it as an answer and only the others as a tag", async () => {
    const { team, admin, anna, bo, treasurer } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: admin.id, body: "Sejr!" } });
    const comment = await prisma.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Flot" } });
    await signIn(bo);
    expect(await addComment(undefined, formData({ postId: post.id, parentId: comment.id, body: "@Anna @Kasserer @Træner enig" }))).toEqual({ ok: true });
    await runAfter();
    // One push each.
    expect(sent[0]).toEqual({ to: [anna.id], title: "Bo svarede på din kommentar" });
    expect(sent.slice(1)).toEqual(
      expect.arrayContaining([
        { to: [admin.id], title: "Bo nævnte dig i en kommentar" },
        { to: [treasurer.id], title: "Bo nævnte dig i en kommentar" },
      ]),
    );
    expect(sent).toHaveLength(3);
  });

  it("without a tag, only the author hears of it, as before", async () => {
    const { team, anna, bo } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr!" } });
    await listening(anna.id);
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "Flot, Kasserer" }));
    await runAfter();
    expect(sent).toEqual([{ to: [anna.id], title: "Bo kommenterede dit opslag" }]);
  });

  it("cannot tag somebody on another team", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    await makeMember(other.team.id, "Søren");
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr!" } });
    await listening(anna.id);
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "@Søren kom og se" }));
    await runAfter();
    expect(sent).toEqual([{ to: [anna.id], title: "Bo kommenterede dit opslag" }]);
  });

  it("refuses a comment on another team's post, and tags nobody", async () => {
    const { bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "x" } });
    await signIn(bo);
    expect(await addComment(undefined, formData({ postId: theirs.id, body: "@Anna" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    await runAfter();
    expect(sent).toEqual([]);
  });
});
