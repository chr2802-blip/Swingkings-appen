import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// The push services are stood in for: every send is recorded, and an endpoint can be
// told to answer like one that has gone away.
const push = vi.hoisted(() => ({ sent: [] as { endpoint: string; payload: string; options: unknown }[], gone: new Set<string>(), broken: new Set<string>() }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: async (sub: { endpoint: string }, payload: string, options: unknown) => {
      if (push.gone.has(sub.endpoint)) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (push.broken.has(sub.endpoint)) throw Object.assign(new Error("Boom"), { statusCode: 500 });
      push.sent.push({ endpoint: sub.endpoint, payload, options });
    },
  },
}));

const feed = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-fetch")>()),
  safeFetch: async () => {
    feed.calls++;
    return new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR");
  },
}));

import { PUSH_TIMEOUT_MS, sendPushToUsers } from "@/lib/push";
import { notifyLater } from "@/lib/notify";
import { removeSubscription, saveSubscription, sendTestPush } from "@/app/actions/push";
import { GET as dailyJob } from "@/app/api/cron/daily/route";
import { makeSquad, makeUser, signIn } from "../helpers/factories";
import { afterQueue, runAfter } from "../helpers/next-mocks";
import { expectRedirectToLogin } from "../helpers/expect";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
// An IP literal on the public internet: checked without a DNS lookup.
const endpoint = (n: number) => `https://8.8.8.8/push/${n}`;

function subscribe(userId: string, n: number) {
  return prisma.pushSubscription.create({ data: { userId, endpoint: endpoint(n), ...keys } });
}

beforeEach(() => {
  push.sent.length = 0;
  push.gone.clear();
  push.broken.clear();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});

describe("saveSubscription", () => {
  it("saves a browser's subscription, and moves it to whoever signs in on that device", async () => {
    const anna = await makeUser({ name: "Anna" });
    const bo = await makeUser({ name: "Bo" });
    await signIn(anna);
    expect(await saveSubscription({ endpoint: endpoint(1), keys })).toBe(true);
    await signIn(bo);
    expect(await saveSubscription({ endpoint: endpoint(1), keys })).toBe(true);
    expect(await prisma.pushSubscription.findMany({ select: { userId: true } })).toEqual([{ userId: bo.id }]);
  });

  it("keeps ten devices per person: past that the oldest make room", async () => {
    const anna = await makeUser({ name: "Anna" });
    await signIn(anna);
    for (let n = 1; n <= 12; n++) {
      expect(await saveSubscription({ endpoint: endpoint(n), keys })).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const kept = (await prisma.pushSubscription.findMany({ select: { endpoint: true } })).map((row) => row.endpoint).sort();
    expect(kept).toEqual(Array.from({ length: 10 }, (_, i) => endpoint(i + 3)).sort());
    // Saving a device already held takes no second place.
    expect(await saveSubscription({ endpoint: endpoint(5), keys })).toBe(true);
    expect(await prisma.pushSubscription.count()).toBe(10);
  });

  it("refuses an endpoint that is not https on the public internet, and keys a browser would not send", async () => {
    await signIn(await makeUser());
    for (const bad of ["http://8.8.8.8/push", "https://127.0.0.1/push", "https://[::1]/push", "https://localhost/push", "https://10.0.0.5/push", "ikke-en-url"]) {
      expect(await saveSubscription({ endpoint: bad, keys }), bad).toBe(false);
    }
    expect(await saveSubscription({ endpoint: endpoint(1), keys: { p256dh: "kort", auth: keys.auth } })).toBe(false);
    expect(await saveSubscription({ endpoint: endpoint(1), keys: { p256dh: keys.p256dh, auth: "<script>" } })).toBe(false);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("removes only the caller's own subscription", async () => {
    const anna = await makeUser({ name: "Anna" });
    const bo = await makeUser({ name: "Bo" });
    await subscribe(anna.id, 1);
    await signIn(bo);
    await removeSubscription(endpoint(1));
    expect(await prisma.pushSubscription.count()).toBe(1);
    await signIn(anna);
    await removeSubscription(endpoint(1));
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => saveSubscription({ endpoint: endpoint(1), keys }));
  });
});

describe("sendPushToUsers", () => {
  it("sends to every device, with a timeout, and forgets the ones that have gone", async () => {
    const anna = await makeUser();
    await subscribe(anna.id, 1);
    await subscribe(anna.id, 2);
    await subscribe(anna.id, 3);
    push.gone.add(endpoint(2));
    push.broken.add(endpoint(3));

    expect(await sendPushToUsers([anna.id], { title: "Hej", body: "Test" })).toBe(1);
    expect(push.sent).toEqual([{ endpoint: endpoint(1), payload: JSON.stringify({ title: "Hej", body: "Test" }), options: { timeout: PUSH_TIMEOUT_MS } }]);
    // 410 means the subscription is dead; a 500 is the service's bad day, so it is kept.
    expect((await prisma.pushSubscription.findMany({ select: { endpoint: true } })).map((s) => s.endpoint).sort()).toEqual([endpoint(1), endpoint(3)]);
  });

  it("sends nothing to nobody", async () => {
    expect(await sendPushToUsers([], { title: "x", body: "x" })).toBe(0);
  });

  it("sends a test notification to the caller", async () => {
    const anna = await makeUser();
    await subscribe(anna.id, 1);
    await signIn(anna);
    expect(await sendTestPush()).toBe(1);
  });
});

describe("notifyLater", () => {
  it("tells everybody but the person who caused it, once each, after the response", async () => {
    const { anna, bo, admin } = await makeSquad();
    await subscribe(anna.id, 1);
    await subscribe(bo.id, 2);
    await subscribe(admin.id, 3);

    notifyLater([anna.id, bo.id, bo.id, admin.id], admin.id, { title: "Bøde", body: "x" });
    expect(push.sent).toHaveLength(0);
    await runAfter();
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual([endpoint(1), endpoint(2)]);
  });

  it("does nothing when only the actor would hear, or with no keys", async () => {
    const anna = await makeUser();
    notifyLater([anna.id], anna.id, { title: "x", body: "x" });
    delete process.env.VAPID_PRIVATE_KEY;
    notifyLater(["someone"], anna.id, { title: "x", body: "x" });
    expect(afterQueue).toHaveLength(0);
  });
});

describe("the daily job", () => {
  const call = (auth?: string) =>
    dailyJob(new Request("http://localhost/api/cron/daily", { headers: auth ? { authorization: auth } : {} }));

  it("answers nobody without the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer forkert")).status).toBe(401);
  });

  it("syncs every team with a link and reminds assignees of jobs due by tomorrow, once a day", async () => {
    const { team, anna, bo } = await makeSquad();
    await prisma.team.update({ where: { id: team.id }, data: { calendarUrl: "https://kampklar.dk/a.ics" } });
    await makeSquad("Uden link");
    await subscribe(anna.id, 1);
    await subscribe(bo.id, 2);
    const hours = (h: number) => new Date(Date.now() + h * 3_600_000);
    const due = await prisma.task.create({ data: { teamId: team.id, title: "Tøjvask", dueAt: hours(5), assignees: { create: { userId: anna.id } } } });
    await prisma.task.create({ data: { teamId: team.id, title: "Om en uge", dueAt: hours(24 * 7), assignees: { create: { userId: bo.id } } } });
    await prisma.task.create({ data: { teamId: team.id, title: "Færdig", dueAt: hours(5), doneAt: new Date(), assignees: { create: { userId: bo.id } } } });
    await prisma.task.create({ data: { teamId: team.id, title: "Ingen", dueAt: hours(5) } });

    const response = await call("Bearer test-cron-secret");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ tasksDue: 1, notificationsSent: 1, synced: { [team.id]: "+0 ~0 x0" } });
    expect(feed.calls).toBe(1);
    expect(JSON.parse(push.sent[0]!.payload)).toMatchObject({ title: "Husk: Tøjvask", url: `/opgaver/${due.id}` });

    // A second run the same day reminds nobody again.
    expect(await (await call("Bearer test-cron-secret")).json()).toMatchObject({ tasksDue: 0 });
  });
});
