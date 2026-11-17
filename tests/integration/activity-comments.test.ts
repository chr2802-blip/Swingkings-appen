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
import { addActivityComment, deleteActivityComment } from "@/app/actions/activity-comments";
import { formData, makeMatch, makeSquad, signIn } from "../helpers/factories";
import { runAfter } from "../helpers/next-mocks";
import { expectRedirectToLogin } from "../helpers/expect";

beforeEach(() => {
  process.env.VAPID_PRIVATE_KEY = "test";
});
afterEach(() => {
  delete process.env.VAPID_PRIVATE_KEY;
  pushed.length = 0;
});

const sorted = (ids: string[]) => [...ids].sort();

describe("commenting on an activity", () => {
  it("writes the comment on the activity and tells the rest of the team", async () => {
    const { team, admin, treasurer, anna, bo } = await makeSquad();
    const match = await makeMatch(team.id, { opponent: "B.93" });
    await signIn(anna);
    expect(await addActivityComment(undefined, formData({ matchId: match.id, body: "  Hvem kører?  " }))).toEqual({ ok: true });
    await runAfter();

    expect(await prisma.activityComment.findMany({ select: { teamId: true, matchId: true, authorId: true, body: true, parentId: true } })).toEqual([
      { teamId: team.id, matchId: match.id, authorId: anna.id, body: "Hvem kører?", parentId: null },
    ]);
    // One push each, carrying each one's notification in the center, which is the activity's.
    expect(sorted(pushed.flatMap((p) => p.to))).toEqual(sorted([admin.id, treasurer.id, bo.id]));
    for (const { payload } of pushed) {
      expect(payload).toEqual({
        title: "Ny kommentar · B.93",
        body: "Anna: Hvem kører?",
        url: `/aktiviteter/${match.id}`,
        tag: `activity-comments-${match.id}`,
        notificationId: expect.any(String),
      });
    }
    const rows = await prisma.notification.findMany({ select: { userId: true, category: true, matchId: true } });
    expect(sorted(rows.map((r) => r.userId))).toEqual(sorted([admin.id, treasurer.id, bo.id]));
    expect(rows.every((r) => r.category === "COMMENTS" && r.matchId === match.id)).toBe(true);
  });

  it("puts an answer under the comment that started the thread, and tells who was answered and who was tagged in their own words", async () => {
    const { team, admin, treasurer, anna, bo } = await makeSquad();
    const match = await makeMatch(team.id, { kind: "TRAINING", title: "Træning" });
    const first = await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: anna.id, body: "Bane 3?" } });
    const answer = await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: bo.id, body: "Ja", parentId: first.id } });
    await signIn(admin);
    expect(await addActivityComment(undefined, formData({ matchId: match.id, parentId: answer.id, body: "Rigtigt, spørg @Kasserer" }))).toEqual({ ok: true });
    await runAfter();

    expect((await prisma.activityComment.findFirstOrThrow({ where: { body: { startsWith: "Rigtigt" } } })).parentId).toBe(first.id);
    const url = `/aktiviteter/${match.id}`;
    const tag = `activity-comments-${match.id}`;
    const notificationId = expect.any(String);
    const answered = { title: "Træner svarede på din kommentar · Træning", body: "Rigtigt, spørg @Kasserer", url, tag, notificationId };
    expect(pushed.slice(0, 2)).toEqual(expect.arrayContaining([{ to: [bo.id], payload: answered }, { to: [anna.id], payload: answered }]));
    expect(pushed.slice(2)).toEqual([
      { to: [treasurer.id], payload: { title: "Træner nævnte dig · Træning", body: "Rigtigt, spørg @Kasserer", url, tag, notificationId } },
    ]);
  });

  it("refuses an empty comment, an overlong one, and an answer to a comment on another activity", async () => {
    const { team, anna } = await makeSquad();
    const match = await makeMatch(team.id);
    const elsewhere = await makeMatch(team.id, { opponent: "KB" });
    const there = await prisma.activityComment.create({ data: { teamId: team.id, matchId: elsewhere.id, authorId: anna.id, body: "x" } });
    await signIn(anna);
    expect(await addActivityComment(undefined, formData({ matchId: match.id, body: "  " }))).toEqual({ ok: false, error: "Skriv en kommentar." });
    expect(await addActivityComment(undefined, formData({ matchId: match.id, body: "x".repeat(1001) }))).toEqual({ ok: false, error: "Højst 1000 tegn." });
    expect(await addActivityComment(undefined, formData({ matchId: match.id, parentId: there.id, body: "Svar" }))).toEqual({ ok: false, error: "Kommentaren findes ikke længere." });
    expect(await prisma.activityComment.count()).toBe(1);
  });

  it("lets every role comment", async () => {
    const { team, admin, treasurer, anna } = await makeSquad();
    const match = await makeMatch(team.id);
    for (const user of [admin, treasurer, anna]) {
      await signIn(user);
      expect(await addActivityComment(undefined, formData({ matchId: match.id, body: "Her" }))).toEqual({ ok: true });
    }
    expect(await prisma.activityComment.count()).toBe(3);
  });

  it("finds no activity and no comment of another team's", async () => {
    const { anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await makeMatch(other.team.id);
    const comment = await prisma.activityComment.create({ data: { teamId: other.team.id, matchId: theirs.id, authorId: other.anna.id, body: "x" } });
    await signIn(anna);
    expect(await addActivityComment(undefined, formData({ matchId: theirs.id, body: "Kapret" }))).toEqual({ ok: false, error: "Aktiviteten findes ikke." });
    await deleteActivityComment(undefined, formData({ id: comment.id }));
    expect(await prisma.activityComment.count()).toBe(1);
  });

  it("goes with its activity", async () => {
    const { team, anna } = await makeSquad();
    const match = await makeMatch(team.id);
    await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: anna.id, body: "x" } });
    await prisma.match.delete({ where: { id: match.id } });
    expect(await prisma.activityComment.count()).toBe(0);
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => addActivityComment(undefined, formData({ matchId: "x", body: "x" })));
    await expectRedirectToLogin(() => deleteActivityComment(undefined, formData({ id: "x" })));
  });
});

describe("deleting a comment on an activity", () => {
  it("is for its writer and the team's admins, and takes its answers with it", async () => {
    const { team, admin, treasurer, anna, bo } = await makeSquad();
    const match = await makeMatch(team.id);
    const first = await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: anna.id, body: "Første" } });
    await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: bo.id, body: "Svar", parentId: first.id } });
    const second = await prisma.activityComment.create({ data: { teamId: team.id, matchId: match.id, authorId: anna.id, body: "Anden" } });

    for (const user of [bo, treasurer]) {
      await signIn(user);
      expect(await deleteActivityComment(undefined, formData({ id: first.id }))).toEqual({ ok: false, error: "Det er ikke din kommentar." });
    }
    await signIn(anna);
    expect(await deleteActivityComment(undefined, formData({ id: first.id }))).toEqual({ ok: true });
    expect((await prisma.activityComment.findMany({ select: { body: true } })).map((c) => c.body)).toEqual(["Anden"]);

    await signIn(admin);
    expect(await deleteActivityComment(undefined, formData({ id: second.id }))).toEqual({ ok: true });
    expect(await prisma.activityComment.count()).toBe(0);
  });
});
