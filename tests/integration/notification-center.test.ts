import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// The push services are stood in for: every send is recorded.
const push = vi.hoisted(() => ({ sent: [] as { endpoint: string; payload: Record<string, unknown> }[] }));
vi.mock("web-push", () => ({
  setVapidDetails: vi.fn(),
  sendNotification: async (sub: { endpoint: string }, payload: string) => {
    push.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  },
}));

import {
  KEEP_DAYS,
  clearOldNotifications,
  notificationCenter,
  notify,
  recordComment,
  unseenCount,
} from "@/lib/notifications";
import { teamDb } from "@/lib/team-db";
import { pushChat } from "@/lib/grouped-push";
import { startSeason } from "@/lib/season-data";
import {
  markNotificationsSeen,
  readAllNotifications,
  readNotification,
  saveNotificationSettings,
} from "@/app/actions/notification-center";
import { createChallenge, deleteFine, giveFine, moveChallenge } from "@/app/actions/fines";
import { addComment, deletePost } from "@/app/actions/social";
import { deleteTask, offerTask } from "@/app/actions/tasks";
import { GET as centerRoute } from "@/app/api/notifications/route";
import { GET as unreadRoute } from "@/app/api/notifications/unread/route";
import { POST as readRoute } from "@/app/api/notifications/read/route";
import { GET as dailyJob } from "@/app/api/cron/daily/route";
import { formData, joinTeam, makeMatch, makeSquad, signIn, signOut } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";
import { expectRedirectToLogin } from "../helpers/expect";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const subscribe = (userId: string, name: string) =>
  prisma.pushSubscription.create({ data: { userId, endpoint: `https://8.8.8.8/push/${name}`, ...keys } });
/** Who got a push, by the name they subscribed under. */
const pushedTo = () => push.sent.map((s) => s.endpoint.split("/").pop()).sort();

const mute = (userId: string, teamId: string, mutedPush: ("FINES" | "CHAT" | "REMINDERS" | "TASKS" | "COMMENTS")[]) =>
  prisma.teamMember.update({ where: { userId_teamId: { userId, teamId } }, data: { mutedPush } });

const rowsFor = (userId: string, teamId?: string) =>
  prisma.notification.findMany({ where: { userId, ...(teamId ? { teamId } : {}) }, orderBy: { createdAt: "asc" } });

const notice = { category: "FINES" as const, title: "Bøde", body: "For sent", url: "/boder" };

beforeEach(() => {
  push.sent.length = 0;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});

describe("notify", () => {
  it("writes one row per person on the team, never the actor's or an outsider's, and pushes each their own", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    await Promise.all([subscribe(anna.id, "anna"), subscribe(bo.id, "bo"), subscribe(admin.id, "admin")]);

    await notify(team.id, [anna.id, bo.id, anna.id, admin.id, other.anna.id], admin.id, notice);
    const rows = await prisma.notification.findMany({ select: { id: true, userId: true, teamId: true, readAt: true } });
    expect(rows.map((r) => r.userId).sort()).toEqual([anna.id, bo.id].sort());
    expect(rows.every((r) => r.teamId === team.id && r.readAt === null)).toBe(true);

    await runAfter();
    expect(pushedTo()).toEqual(["anna", "bo"]);
    const annas = push.sent.find((s) => s.endpoint.endsWith("/anna"))!.payload;
    expect(annas).toEqual({ title: "Bøde", body: "For sent", url: "/boder", notificationId: rows.find((r) => r.userId === anna.id)!.id });
  });

  it("keeps a muted category under the bell but off the phone, unless it waits on the person", async () => {
    const { team, admin, anna } = await makeSquad();
    await subscribe(anna.id, "anna");
    await mute(anna.id, team.id, ["FINES"]);

    await notify(team.id, [anna.id], admin.id, notice);
    await runAfter();
    expect(push.sent).toHaveLength(0);
    expect(await rowsFor(anna.id)).toHaveLength(1);

    await notify(team.id, [anna.id], admin.id, { ...notice, title: "Betal dine bøder", always: true });
    await notify(team.id, [anna.id], admin.id, { ...notice, category: "TEAM", title: "Fra træneren" });
    await runAfter();
    expect(push.sent.map((s) => s.payload.title)).toEqual(["Betal dine bøder", "Fra træneren"]);
  });

  it("mutes per team: muted on one team is not muted on another", async () => {
    const { team, admin, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await joinTeam(anna.id, other.team.id);
    await subscribe(anna.id, "anna");
    await mute(anna.id, team.id, ["FINES"]);

    await notify(other.team.id, [anna.id], other.admin.id, notice);
    await notify(team.id, [anna.id], admin.id, notice);
    await runAfter();
    expect(push.sent).toHaveLength(1);
  });
});

describe("what a notification is about", () => {
  it("a fine's notification goes when the fine is deleted", async () => {
    const { team, admin, anna } = await makeSquad();
    await signIn(admin);
    await giveFine(undefined, formData({ playerId: anna.id, reason: "Glemt støvler" }));
    const [row] = await rowsFor(anna.id);
    expect(row).toMatchObject({ category: "FINES", title: "Du har fået en bøde 💸", url: "/boder" });
    const fine = await prisma.fine.findFirstOrThrow({ where: { teamId: team.id } });
    expect(row!.fineId).toBe(fine.id);

    await deleteFine(undefined, formData({ id: fine.id }));
    expect(await rowsFor(anna.id)).toHaveLength(0);
  });

  it("a challenge withdrawn takes its notification with it", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "x", units: 3, unitPriceKr: 10, issuedById: admin.id } });
    await signIn(anna);
    expect(await createChallenge(undefined, formData({ opponentId: bo.id, outcome: "won", description: "Mål", units: "2" }))).toMatchObject({ ok: true });
    const challenge = await prisma.challenge.findFirstOrThrow({ where: { teamId: team.id } });
    expect(await rowsFor(bo.id)).toMatchObject([{ category: "CHALLENGES", challengeId: challenge.id }]);

    await moveChallenge(undefined, formData({ id: challenge.id, move: "cancel" }));
    expect(await rowsFor(bo.id)).toHaveLength(0);
  });

  it("a task deleted, or a post deleted, takes theirs", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    const match = await makeMatch(team.id);
    const task = await prisma.task.create({
      data: { teamId: team.id, matchId: match.id, title: "Vask tøj", createdById: admin.id, assignees: { create: [{ userId: anna.id }] } },
    });
    await signIn(anna);
    await offerTask(undefined, formData({ id: task.id, toId: bo.id }));
    expect(await rowsFor(bo.id)).toMatchObject([{ category: "TASKS", taskId: task.id, title: "Vil du overtage: Vask tøj?" }]);
    await signIn(admin);
    await deleteTask(undefined, formData({ id: task.id }));
    expect(await rowsFor(bo.id)).toHaveLength(0);

    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr" } });
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "Flot" }));
    expect(await rowsFor(anna.id)).toHaveLength(1);
    await signIn(anna);
    await deletePost(undefined, formData({ id: post.id }));
    expect(await rowsFor(anna.id)).toHaveLength(0);
  });

  it("a new season clears what was said about fines and challenges, and only on its own team", async () => {
    const { team, admin, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await notify(team.id, [anna.id], admin.id, notice);
    await notify(team.id, [anna.id], admin.id, { ...notice, category: "CHALLENGES" });
    await notify(team.id, [anna.id], admin.id, { ...notice, category: "FEED" });
    await notify(other.team.id, [other.anna.id], other.admin.id, notice);

    expect(await startSeason(team.id, "Efterår")).toMatchObject({ ok: true });
    expect((await rowsFor(anna.id)).map((r) => r.category)).toEqual(["FEED"]);
    expect(await rowsFor(other.anna.id)).toHaveLength(1);
  });
});

describe("comments on one's own post", () => {
  it("are one row while unread, counting them, and a new one once it is read", async () => {
    const { team, anna, bo, treasurer } = await makeSquad();
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr" } });
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "Flot" }));
    expect(await rowsFor(anna.id)).toMatchObject([{ title: "Bo kommenterede dit opslag", body: "Flot", postId: post.id }]);

    await signIn(treasurer);
    await addComment(undefined, formData({ postId: post.id, body: "Enig" }));
    // Anna's own comment is no news to her.
    await prisma.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Tak" } });
    await recordComment(team.id, post.id, treasurer.id);
    const [row] = await rowsFor(anna.id);
    expect(await rowsFor(anna.id)).toHaveLength(1);
    expect(row).toMatchObject({ title: "2 nye kommentarer på dit opslag" });

    await signIn(anna);
    await readNotification(undefined, formData({ id: row!.id }));
    await signIn(bo);
    await addComment(undefined, formData({ postId: post.id, body: "Igen" }));
    expect((await rowsFor(anna.id)).map((r) => r.title)).toEqual(["2 nye kommentarer på dit opslag", "Bo kommenterede dit opslag"]);
  });

  it("are not written for one's own comment, nor for a post on another team", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const post = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr" } });
    await prisma.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Mig selv" } });
    await recordComment(team.id, post.id, anna.id);
    await recordComment(other.team.id, post.id, other.anna.id);
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("the bell and the center", () => {
  it("counts what came since the center was opened; opening it keeps each one new until read", async () => {
    const { team, admin, anna } = await makeSquad();
    await notify(team.id, [anna.id], admin.id, notice);
    await notify(team.id, [anna.id], admin.id, { ...notice, title: "Anden" });
    expect(await unseenCount(team.id, anna.id)).toBe(2);

    await signIn(anna);
    expect(await markNotificationsSeen()).toEqual({ ok: true });
    expect(await unseenCount(team.id, anna.id)).toBe(0);
    const center = await notificationCenter(team.id, anna.id);
    expect(center.items.map((i) => [i.title, i.read])).toEqual([
      ["Anden", false],
      ["Bøde", false],
    ]);

    expect(await readNotification(undefined, formData({ id: center.items[0]!.id }))).toEqual({ ok: true });
    expect((await notificationCenter(team.id, anna.id)).items.map((i) => i.read)).toEqual([true, false]);
    await notify(team.id, [anna.id], admin.id, { ...notice, title: "Tredje" });
    expect(await unseenCount(team.id, anna.id)).toBe(1);

    expect(await readAllNotifications()).toEqual({ ok: true });
    expect(await unseenCount(team.id, anna.id)).toBe(0);
    expect((await notificationCenter(team.id, anna.id)).items.every((i) => i.read)).toBe(true);
  });

  it("will not read somebody else's notification, nor one on another team", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    await joinTeam(anna.id, other.team.id);
    const [annas] = await notify(team.id, [anna.id], admin.id, notice);
    const [elsewhere] = await notify(other.team.id, [anna.id], other.admin.id, notice);

    await signIn(bo);
    expect(await readNotification(undefined, formData({ id: annas!.id }))).toEqual({ ok: false, error: "Notifikationen findes ikke." });
    await readAllNotifications();
    // Anna's team on screen is the first; the other team's is not hers here.
    await signIn(anna);
    expect(await readNotification(undefined, formData({ id: elsewhere!.id }))).toEqual({ ok: false, error: "Notifikationen findes ikke." });
    expect(await readNotification(undefined, formData({}))).toEqual({ ok: false, error: "Notifikationen findes ikke." });
    await readAllNotifications();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: elsewhere!.id } })).readAt).toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: annas!.id } })).readAt).not.toBeNull();
  });

  it("is for somebody signed in", async () => {
    signOut();
    await expectRedirectToLogin(() => markNotificationsSeen());
    await expectRedirectToLogin(() => readAllNotifications());
    await expectRedirectToLogin(() => readNotification(undefined, formData({ id: "x" })));
    await expectRedirectToLogin(() => saveNotificationSettings(undefined, formData({})));
  });
});

describe("saveNotificationSettings", () => {
  it("mutes what is not ticked, on the team on screen only", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await joinTeam(anna.id, other.team.id);
    await signIn(anna);
    expect(await saveNotificationSettings(undefined, formData({ on: ["FINES", "CHALLENGES", "TASKS", "REMINDERS", "ACTIVITIES", "COMMENTS"] }))).toEqual({
      ok: true,
      note: "Gemt.",
    });
    const member = (teamId: string) => prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId } } });
    expect((await member(team.id)).mutedPush).toEqual(["FEED", "CHAT"]);
    expect((await member(other.team.id)).mutedPush).toEqual([]);
    expect((await notificationCenter(team.id, anna.id)).muted).toEqual(["FEED", "CHAT"]);
  });

  it("refuses a category there is none of, and TEAM, which cannot be muted", async () => {
    const { team, anna } = await makeSquad();
    await signIn(anna);
    expect(await saveNotificationSettings(undefined, formData({ on: ["FINES", "NOPE"] }))).toEqual({ ok: false, error: "Prøv igen." });
    expect(await saveNotificationSettings(undefined, formData({ on: "TEAM" }))).toEqual({ ok: false, error: "Prøv igen." });
    expect((await prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } })).mutedPush).toEqual([]);
  });

  it("muting the chat stops its push", async () => {
    const { team, anna, bo } = await makeSquad();
    await Promise.all([subscribe(anna.id, "anna"), subscribe(bo.id, "bo")]);
    await mute(anna.id, team.id, ["CHAT"]);
    const treasurer = await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, role: "TREASURER" } });
    await prisma.chatMessage.create({ data: { teamId: team.id, authorId: treasurer.userId, body: "Hej" } });
    await pushChat(team.id, team.name, treasurer.userId);
    expect(pushedTo()).toEqual(["bo"]);
  });
});

describe("the routes", () => {
  it("give the center and the count of one's own notifications on the team on screen, and nobody's without a session", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    await notify(team.id, [anna.id, bo.id], admin.id, notice);
    await signIn(anna);
    const center = await (await centerRoute()).json();
    expect(center).toMatchObject({ unseen: 1, muted: [], items: [{ title: "Bøde", body: "For sent", url: "/boder", read: false, category: "FINES" }] });
    expect(center.items).toHaveLength(1);
    expect(await (await unreadRoute()).json()).toEqual({ unseen: 1 });

    signOut();
    expect((await centerRoute()).status).toBe(401);
    expect((await unreadRoute()).status).toBe(401);
  });

  it("reads a push opened on the phone, and only one's own", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    const [annas] = await notify(team.id, [anna.id], admin.id, notice);
    const read = (id: unknown) =>
      readRoute(new Request("http://localhost/api/notifications/read", { method: "POST", body: JSON.stringify({ id }) }));

    await signIn(bo);
    expect((await read(annas!.id)).status).toBe(404);
    expect((await read(42)).status).toBe(404);
    await signIn(anna);
    expect((await read(annas!.id)).status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: annas!.id } })).readAt).not.toBeNull();
    signOut();
    expect((await read(annas!.id)).status).toBe(401);
  });
});

describe("the daily job", () => {
  const call = () =>
    dailyJob(new Request("http://localhost/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));

  it("puts reminders under the bell, pushes them unless muted, and forgets notifications past KEEP_DAYS", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    await Promise.all([subscribe(anna.id, "anna"), subscribe(bo.id, "bo")]);
    await mute(bo.id, team.id, ["REMINDERS"]);
    const task = await prisma.task.create({
      data: {
        teamId: team.id,
        title: "Kridt banen",
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        assignees: { create: [{ userId: anna.id }, { userId: bo.id }] },
      },
    });
    const [old] = await notify(team.id, [anna.id], admin.id, notice);
    await prisma.notification.update({ where: { id: old!.id }, data: { updatedAt: new Date(Date.now() - (KEEP_DAYS + 1) * 24 * 60 * 60 * 1000) } });

    expect((await call()).status).toBe(200);
    expect(pushedTo()).toEqual(["anna"]);
    const rows = await prisma.notification.findMany({ select: { userId: true, category: true, taskId: true } });
    expect(rows.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual(
      [anna.id, bo.id].sort().map((userId) => ({ userId, category: "REMINDERS", taskId: task.id })),
    );
    expect(await clearOldNotifications()).toBe(0);
  });
});

describe("teamDb", () => {
  it("stamps the team on rows made with createManyAndReturn", async () => {
    const { team, anna } = await makeSquad();
    const [row] = await teamDb(team.id).notification.createManyAndReturn({
      data: [{ teamId: "somebody-else", userId: anna.id, category: "FEED", title: "x", body: "x", url: "/" }],
    });
    expect(row!.teamId).toBe(team.id);
  });
});
