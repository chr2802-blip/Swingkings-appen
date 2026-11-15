import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// The push services are stood in for: every send is recorded.
const push = vi.hoisted(() => ({ sent: [] as { endpoint: string; payload: Record<string, unknown> }[] }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      push.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    },
  },
}));

import { claimFullPush, clearOldPushPauses, pushChat, pushComments } from "@/lib/grouped-push";
import { PUSH_PAUSE_MS } from "@/lib/push-summary";
import { isApplePush } from "@/lib/push";
import { markChatSeen } from "@/lib/chat";
import { sendChatMessage, addComment } from "@/app/actions/social";
import { GET as chatRoute } from "@/app/api/chat/route";
import { formData, makeSquad, signIn } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const subscribe = (userId: string, endpoint: string) => prisma.pushSubscription.create({ data: { userId, endpoint, ...keys } });

const minutes = (n: number) => n * 60 * 1000;
// In the past, so the actions' own "now" comes after it.
const start = new Date("2026-11-01T18:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);

beforeEach(() => {
  push.sent.length = 0;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});

/** A team whose members joined before `start`, with Anna listening on one device. */
async function chatTeam() {
  const squad = await makeSquad();
  await prisma.teamMember.updateMany({ where: { teamId: squad.team.id }, data: { createdAt: new Date(start.getTime() - minutes(60)) } });
  await subscribe(squad.anna.id, "https://fcm.googleapis.com/fcm/send/anna");
  const say = async (author: { id: string }, body: string, when: Date) => {
    await prisma.chatMessage.create({ data: { teamId: squad.team.id, authorId: author.id, body, createdAt: when } });
    await pushChat(squad.team.id, squad.team.name, author.id, when);
  };
  return { ...squad, say };
}

describe("the team chat", () => {
  it("buzzes once, then only updates quietly with a count until the pause is over", async () => {
    const { bo, treasurer, say } = await chatTeam();
    await say(bo, "Hvem kommer?", at(0));
    await say(treasurer, "Mig", at(minutes(1)));
    await say(bo, "Fedt", at(minutes(2)));
    expect(push.sent.map((s) => s.payload)).toEqual([
      { title: "Bo · Swingkings", body: "Hvem kommer?", url: "/chat", tag: expect.stringMatching(/^chat-/), quiet: false },
      { title: "Swingkings · 2 nye beskeder", body: "Kasserer og Bo\nKasserer: Mig", url: "/chat", tag: expect.any(String), quiet: true },
      { title: "Swingkings · 3 nye beskeder", body: "Bo og Kasserer\nBo: Fedt", url: "/chat", tag: expect.any(String), quiet: true },
    ]);

    push.sent.length = 0;
    await say(bo, "Husk støvler", at(PUSH_PAUSE_MS + minutes(1)));
    expect(push.sent[0]!.payload).toMatchObject({ title: "Swingkings · 4 nye beskeder", quiet: false });
  });

  it("counts from when the chat was last open, and buzzes again once it has been read", async () => {
    const { team, anna, bo, say } = await chatTeam();
    await say(bo, "Første", at(0));
    await markChatSeen(team.id, anna.id, at(minutes(2)));
    push.sent.length = 0;
    await say(bo, "Anden", at(minutes(4)));
    expect(push.sent.map((s) => s.payload)).toEqual([expect.objectContaining({ title: "Bo · Swingkings", body: "Anden", quiet: false })]);
  });

  it("sends nothing to somebody who has the chat open, nor to the writer", async () => {
    const { team, anna, bo, say } = await chatTeam();
    await subscribe(bo.id, "https://fcm.googleapis.com/fcm/send/bo");
    await markChatSeen(team.id, anna.id, at(minutes(-0.5)));
    await say(bo, "Er I der?", at(0));
    expect(push.sent).toHaveLength(0);
  });

  it("takes one's own message as having read what came before it", async () => {
    const { anna, bo, say } = await chatTeam();
    await say(bo, "Første", at(0));
    await say(anna, "Svar", at(minutes(1)));
    push.sent.length = 0;
    await say(bo, "Tak", at(minutes(2)));
    expect(push.sent.map((s) => s.payload)).toEqual([expect.objectContaining({ title: "Bo · Swingkings", body: "Tak", quiet: false })]);
  });

  it("leaves the quiet updates out on an iPhone, which would buzz for each", async () => {
    const { anna, bo, say } = await chatTeam();
    await subscribe(anna.id, "https://web.push.apple.com/QGx-anna");
    await say(bo, "Første", at(0));
    await say(bo, "Anden", at(minutes(1)));
    expect(push.sent.map((s) => [new URL(s.endpoint).hostname, s.payload.quiet])).toEqual([
      ["fcm.googleapis.com", false],
      ["web.push.apple.com", false],
      ["fcm.googleapis.com", true],
    ]);
    expect(isApplePush("https://web.push.apple.com/x")).toBe(true);
    expect(isApplePush("https://push.apple.com.evil.example/x")).toBe(false);
  });

  it("is what sending a message does, after the response", async () => {
    const { bo } = await chatTeam();
    await signIn(bo);
    await sendChatMessage(undefined, formData({ body: "Ses i morgen" }));
    expect(push.sent).toHaveLength(0);
    await runAfter();
    expect(push.sent.map((s) => s.payload)).toEqual([expect.objectContaining({ body: "Ses i morgen", quiet: false })]);
  });

  it("counts the chat as open while it is polled", async () => {
    const { team, anna } = await chatTeam();
    await signIn(anna);
    await chatRoute();
    const seen = await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } });
    expect(seen.chatSeenAt).not.toBeNull();
  });
});

describe("comments on a post", () => {
  async function postTeam() {
    const squad = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: squad.team.id, authorId: squad.anna.id, body: "Kampbilleder", createdAt: start } });
    await subscribe(squad.anna.id, "https://fcm.googleapis.com/fcm/send/anna");
    const comment = async (author: { id: string }, body: string, when: Date) => {
      await prisma.postComment.create({ data: { postId: post.id, authorId: author.id, body, createdAt: when } });
      await pushComments(post.id, author.id, when);
    };
    return { ...squad, post, comment };
  }

  it("tells the author once, then gathers the rest quietly into a count", async () => {
    const { bo, treasurer, comment } = await postTeam();
    await comment(bo, "Flot!", at(minutes(1)));
    await comment(treasurer, "Enig", at(minutes(2)));
    expect(push.sent.map((s) => s.payload)).toEqual([
      { title: "Bo kommenterede dit opslag", body: "Flot!", url: "/oversigt#feed", tag: expect.stringMatching(/^comments-/), quiet: false },
      { title: "2 nye kommentarer på dit opslag", body: "Kasserer og Bo\nKasserer: Enig", url: "/oversigt#feed", tag: expect.any(String), quiet: true },
    ]);
  });

  it("says nothing about the author's own comments, nor while they have the feed open", async () => {
    const { team, anna, bo, comment } = await postTeam();
    await comment(anna, "Tak", at(minutes(1)));
    await prisma.teamMember.updateMany({ where: { teamId: team.id, userId: anna.id }, data: { feedSeenAt: at(minutes(1.5)) } });
    await comment(bo, "Flot!", at(minutes(2)));
    expect(push.sent).toHaveLength(0);
  });

  it("is what commenting does, after the response", async () => {
    const { post, bo } = await postTeam();
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "Super" }));
    await runAfter();
    expect(push.sent.map((s) => s.payload)).toEqual([expect.objectContaining({ title: "Bo kommenterede dit opslag", quiet: false })]);
  });
});

describe("claimFullPush", () => {
  it("lets only one of two at once through", async () => {
    const { anna } = await makeSquad();
    const results = await Promise.all([claimFullPush(anna.id, "chat:x", new Date(0), start), claimFullPush(anna.id, "chat:x", new Date(0), start)]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("is forgotten by the daily job once a day old", async () => {
    const { anna } = await makeSquad();
    await claimFullPush(anna.id, "chat:old", new Date(0), new Date(start.getTime() - minutes(25 * 60)));
    await claimFullPush(anna.id, "chat:new", new Date(0), start);
    expect(await clearOldPushPauses(start)).toBe(1);
    expect((await prisma.pushPause.findMany({ select: { key: true } })).map((p) => p.key)).toEqual(["chat:new"]);
  });
});
