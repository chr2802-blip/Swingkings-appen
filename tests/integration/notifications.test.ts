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

import { sendTeamNotice } from "@/app/actions/notifications";
import { formData, makeSquad, signIn } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";
import { expectDenied } from "../helpers/expect";

const BOX = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";
const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

function subscribe(userId: string, name: string) {
  return prisma.pushSubscription.create({ data: { userId, endpoint: `https://8.8.8.8/push/${name}`, ...keys } });
}

const notice = (fields: Record<string, string> = {}) =>
  formData({ to: "alle", title: "Husk kontingent", body: "Senest fredag.", destination: "oversigt", ...fields });

/** What each endpoint was sent, by the name it was subscribed under. */
const sentTo = () => Object.fromEntries(push.sent.map((s) => [s.endpoint.split("/").pop(), s.payload]));

beforeEach(() => {
  push.sent.length = 0;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});

describe("sendTeamNotice", () => {
  it("sends to everybody on the team who has notifications on, but not the sender, and says who was missed", async () => {
    // The treasurer has no device with notifications on.
    const { admin, anna, bo } = await makeSquad();
    await Promise.all([subscribe(admin.id, "admin"), subscribe(anna.id, "anna"), subscribe(bo.id, "bo")]);
    await signIn(admin);
    expect(await sendTeamNotice(undefined, notice())).toEqual({ ok: true, note: "Sendt til 2 personer. 1 har ikke slået notifikationer til." });
    await runAfter();
    expect(sentTo()).toEqual({
      anna: { title: "Husk kontingent", body: "Senest fredag.", url: "/oversigt" },
      bo: { title: "Husk kontingent", body: "Senest fredag.", url: "/oversigt" },
    });
  });

  it("sends to one person, opening their own MobilePay kontingent", async () => {
    const { team, admin, anna, bo } = await makeSquad();
    await prisma.team.update({ where: { id: team.id }, data: { mobilePayLink: BOX, duesKr: 600 } });
    await Promise.all([subscribe(anna.id, "anna"), subscribe(bo.id, "bo")]);
    await signIn(admin);
    expect(await sendTeamNotice(undefined, notice({ to: anna.id, destination: "mobilepay-kontingent" }))).toEqual({ ok: true, note: "Sendt til Anna." });
    await runAfter();
    expect(sentTo()).toEqual({ anna: expect.objectContaining({ url: `${BOX}?amount=60000&message=Kontingent%20%E2%80%93%20Anna` }) });
  });

  it("gives each their own page when that is where it opens, and an outside link as typed", async () => {
    const { admin, anna, bo } = await makeSquad();
    await Promise.all([subscribe(anna.id, "anna"), subscribe(bo.id, "bo")]);
    await signIn(admin);
    await sendTeamNotice(undefined, notice({ destination: "min-side" }));
    await runAfter();
    expect(sentTo()).toMatchObject({ anna: { url: `/spiller/${anna.id}` }, bo: { url: `/spiller/${bo.id}` } });

    push.sent.length = 0;
    await sendTeamNotice(undefined, notice({ to: bo.id, destination: "link", link: "https://dbu.dk/stævne" }));
    await runAfter();
    expect(sentTo()).toEqual({ bo: expect.objectContaining({ url: "https://dbu.dk/st%C3%A6vne" }) });
  });

  it("refuses a link that is not https, MobilePay without a box, and an empty message", async () => {
    const { admin, anna } = await makeSquad();
    await subscribe(anna.id, "anna");
    await signIn(admin);
    expect(await sendTeamNotice(undefined, notice({ destination: "link", link: "javascript:alert(1)" }))).toEqual({
      ok: false,
      error: "Linket skal være en hel adresse, der starter med https://",
    });
    expect(await sendTeamNotice(undefined, notice({ destination: "mobilepay-kontingent" }))).toEqual({
      ok: false,
      error: "Holdet har ikke et MobilePay-link endnu. Sæt det ind under holdets indstillinger.",
    });
    expect(await sendTeamNotice(undefined, notice({ title: " " }))).toEqual({ ok: false, error: "Skriv en overskrift." });
    expect(await sendTeamNotice(undefined, notice({ destination: "/admin" }))).toEqual({ ok: false, error: "Vælg hvor den skal åbne." });
    await runAfter();
    expect(push.sent).toHaveLength(0);
  });

  it("says so when nobody it is for has notifications on", async () => {
    const { admin, anna } = await makeSquad();
    await signIn(admin);
    expect(await sendTeamNotice(undefined, notice())).toEqual({ ok: false, error: "Ingen på holdet har slået notifikationer til endnu." });
    expect(await sendTeamNotice(undefined, notice({ to: anna.id }))).toEqual({ ok: false, error: "Personen har ikke slået notifikationer til." });
  });

  it("treats somebody on another team as not found", async () => {
    const { admin } = await makeSquad();
    const other = await makeSquad("Andre");
    await subscribe(other.anna.id, "theirs");
    await signIn(admin);
    expect(await sendTeamNotice(undefined, notice({ to: other.anna.id }))).toEqual({ ok: false, error: "Personen er ikke på holdet." });
    await runAfter();
    expect(push.sent).toHaveLength(0);
  });

  it("is for the team's admins only", async () => {
    const { anna, bo, treasurer } = await makeSquad();
    await subscribe(bo.id, "bo");
    for (const who of [anna, treasurer]) {
      await signIn(who);
      await expectDenied(() => sendTeamNotice(undefined, notice()));
    }
    await runAfter();
    expect(push.sent).toHaveLength(0);
  });

  it("stops a sender after eight in a quarter of an hour", async () => {
    const { admin, anna } = await makeSquad();
    await subscribe(anna.id, "anna");
    await signIn(admin);
    for (let n = 0; n < 8; n++) expect(await sendTeamNotice(undefined, notice())).toMatchObject({ ok: true });
    expect(await sendTeamNotice(undefined, notice())).toMatchObject({ ok: false, error: expect.stringContaining("Du har sendt mange") });
  });
});
