import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { addComment, createPost, deleteComment, deletePost, editPost, pinPost, vote } from "@/app/actions/social";
import { react } from "@/app/actions/reactions";
import { createChallenge, deleteFine, giveFine, markFinesPaid, saveFineType, setFinePayment } from "@/app/actions/fines";
import { startNewSeason } from "@/app/actions/season";
import { CHAT_POSTED, FEED_CHANGED, FINES_CHANGED, teamTopic } from "@/lib/realtime-topic";
import { formData, makePoll, makeSquad, signIn } from "../helpers/factories";
import { expectDenied, expectRedirect } from "../helpers/expect";
import { runAfter } from "../helpers/next-mocks";

/**
 * The nudges that keep open pages current (`LiveRefresh`): every change to the feed or the
 * fine box tells the team's channel — that team's only — and a refused change tells nobody.
 */

const REALTIME = {
  SUPABASE_URL: "https://swingkings.supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SECRET_KEY: "secret",
  SUPABASE_JWT_SECRET: "jwt-secret",
};

let sent: { topic: string; event: string }[] = [];

beforeEach(() => {
  Object.assign(process.env, REALTIME);
  sent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).endsWith("/realtime/v1/api/broadcast")) {
      const body = JSON.parse(String(init?.body)) as { messages: { topic: string; event: string; payload: unknown }[] };
      for (const message of body.messages) {
        expect(message.payload).toEqual({}); // a nudge, never what changed
        sent.push({ topic: message.topic, event: message.event });
      }
    }
    return new Response(null, { status: 202 });
  });
});

afterEach(() => {
  for (const key of Object.keys(REALTIME)) delete process.env[key];
  vi.restoreAllMocks();
});

/** The events that reached Realtime since the last call. */
async function heard() {
  await runAfter();
  const events = sent;
  sent = [];
  return events;
}

const feedChanged = (teamId: string) => ({ topic: teamTopic(teamId), event: FEED_CHANGED });
const finesChanged = (teamId: string) => ({ topic: teamTopic(teamId), event: FINES_CHANGED });

describe("the feed", () => {
  it("nudges the team for a post, an edit, a pin, a comment, a like, a vote and a deletion", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(anna);

    expect(await createPost(undefined, formData({ body: "Sejr!" }))).toEqual({ ok: true });
    const post = await prisma.post.findFirstOrThrow({ where: { teamId: team.id } });
    const after = await heard();
    expect(after).toContainEqual(feedChanged(team.id));
    expect(after.map((m) => m.topic)).not.toContain(teamTopic(other.team.id));

    expect(await editPost(undefined, formData({ id: post.id, body: "Stor sejr!" }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));
    expect(await pinPost(undefined, formData({ id: post.id, pinned: "on" }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));

    await signIn(bo);
    expect(await addComment(undefined, formData({ postId: post.id, body: "Flot" }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));
    expect(await react(undefined, formData({ target: "post", id: post.id, kind: "FIRE", on: "on" }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));
    const comment = await prisma.postComment.findFirstOrThrow({ where: { postId: post.id } });
    expect(await react(undefined, formData({ target: "comment", id: comment.id, kind: "FIRE", on: "on" }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));
    expect(await deleteComment(undefined, formData({ id: comment.id }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));

    const { poll, optionIds } = await makePoll(team.id, anna.id);
    expect(await vote(undefined, formData({ pollId: poll.id, optionId: optionIds[0] }))).toEqual({ ok: true });
    expect(await heard()).toEqual([feedChanged(team.id)]);

    await signIn(anna);
    expect(await deletePost(undefined, formData({ id: post.id }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(feedChanged(team.id));
  });

  it("does not nudge the feed for a chat reaction", async () => {
    const { team, anna, bo } = await makeSquad();
    const message = await prisma.chatMessage.create({ data: { teamId: team.id, authorId: bo.id, body: "Hej" } });
    await signIn(anna);
    expect(await react(undefined, formData({ target: "chat", id: message.id, kind: "FIRE", on: "on" }))).toEqual({ ok: true });
    expect(await heard()).toEqual([{ topic: teamTopic(team.id), event: CHAT_POSTED }]);
  });

  it("nudges nobody when the change is refused: another team's post, or somebody else's", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "Deres" } });
    const bos = await prisma.post.create({ data: { teamId: team.id, authorId: bo.id, body: "Bos" } });
    await signIn(anna);

    expect(await editPost(undefined, formData({ id: theirs.id, body: "Kapret" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    expect(await pinPost(undefined, formData({ id: theirs.id, pinned: "on" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    expect(await deletePost(undefined, formData({ id: theirs.id }))).toEqual({ ok: true });
    expect(await editPost(undefined, formData({ id: bos.id, body: "Kapret" }))).toEqual({ ok: false, error: "Det er ikke dit opslag." });
    expect(await deletePost(undefined, formData({ id: bos.id }))).toEqual({ ok: false, error: "Det er ikke dit opslag." });
    expect(await addComment(undefined, formData({ postId: theirs.id, body: "Hej" }))).toEqual({ ok: false, error: "Opslaget findes ikke." });
    expect(await heard()).toEqual([]);
  });
});

describe("the fine box", () => {
  it("nudges the team for a fine, a deletion, a challenge, the catalogue and payment", async () => {
    const { team, admin, treasurer, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const type = await prisma.fineType.create({ data: { teamId: team.id, name: "For sent", units: 1 } });
    await signIn(anna);

    expect(await giveFine(undefined, formData({ playerId: bo.id, fineTypeId: type.id }))).toEqual({ ok: true, note: "Bøden er givet." });
    const after = await heard();
    expect(after).toContainEqual(finesChanged(team.id));
    expect(after.map((m) => m.topic)).not.toContain(teamTopic(other.team.id));

    // Bo won, and owes the fine just given: there is something to move.
    expect((await createChallenge(undefined, formData({ opponentId: bo.id, outcome: "lost", description: "Mål", units: "1" })))?.ok).toBe(true);
    expect(await heard()).toContainEqual(finesChanged(team.id));

    const fine = await prisma.fine.findFirstOrThrow({ where: { teamId: team.id } });
    expect(await deleteFine(undefined, formData({ id: fine.id }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(finesChanged(team.id));

    await signIn(treasurer);
    expect(await saveFineType(undefined, formData({ name: "Glemt støvler", units: "1" }))).toEqual({ ok: true });
    expect(await heard()).toContainEqual(finesChanged(team.id));

    await signIn(admin);
    expect((await setFinePayment(undefined, formData({ open: "1" })))?.ok).toBe(true);
    expect(await heard()).toContainEqual(finesChanged(team.id));
    await signIn(treasurer);
    expect((await markFinesPaid(undefined, formData({ playerId: anna.id, paid: "1" })))?.ok).toBe(true);
    expect(await heard()).toContainEqual(finesChanged(team.id));
  });

  it("nudges the team when a new season empties the box", async () => {
    const { team, admin } = await makeSquad();
    await signIn(admin);
    await expectRedirect(() => startNewSeason(undefined, formData({ name: "Sæson 2026", confirm: "on" })), "/hold/saesoner");
    expect(await heard()).toContainEqual(finesChanged(team.id));
  });

  it("nudges nobody when the change is refused: the wrong role, or another team's fine", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.fine.create({
      data: { teamId: other.team.id, playerId: other.bo.id, reason: "x", units: 1, unitPriceKr: 10, issuedById: other.anna.id },
    });
    const bosFine = await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "y", units: 1, unitPriceKr: 10, issuedById: bo.id } });
    await signIn(anna);

    await expectDenied(() => saveFineType(undefined, formData({ name: "Hacket", units: "1" })));
    await expectDenied(() => setFinePayment(undefined, formData({ open: "1" })));
    expect(await deleteFine(undefined, formData({ id: theirs.id }))).toEqual({ ok: true });
    expect((await deleteFine(undefined, formData({ id: bosFine.id })))?.ok).toBe(false);
    expect(await prisma.fine.count()).toBe(2);
    expect(await heard()).toEqual([]);
  });
});
