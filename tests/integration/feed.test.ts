import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { decodeFeedCursor, feedPosts, nextFeedCursor, teamFeed } from "@/lib/feed";
import { markFeedSeen } from "@/app/actions/social";
import { makePoll, makeSquad, signIn } from "../helpers/factories";
import { expectRedirectToLogin } from "../helpers/expect";

describe("feedPosts", () => {
  it("pages through the team's posts newest first, with no post twice or missed, ties included", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const same = new Date("2026-11-01T12:00:00Z");
    // Five posts share a moment, so the id must break the tie for the cursor to hold.
    for (let i = 0; i < 12; i++) {
      await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: `#${i}`, createdAt: i < 5 ? same : new Date(same.getTime() + i * 60_000) } });
    }
    await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "fremmed" } });

    const viewer = { id: anna.id, canAdminister: false };
    const seen: string[] = [];
    let after = null;
    for (let round = 0; round < 5; round++) {
      const page = await feedPosts(team.id, viewer, { take: 5, after });
      seen.push(...page.map((p) => p.body ?? ""));
      const next = nextFeedCursor(page, 5);
      if (!next) break;
      after = decodeFeedCursor(next);
    }
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    expect(seen.slice(0, 7)).toEqual(["#11", "#10", "#9", "#8", "#7", "#6", "#5"]);
    expect(seen).not.toContain("fremmed");
  });

  it("puts pinned posts at the top, the latest pinned first, and pages the rest without them", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));
    for (let i = 1; i <= 7; i++) {
      await prisma.post.create({
        data: { teamId: team.id, authorId: anna.id, body: `#${i}`, createdAt: day(i), pinnedAt: i === 2 ? day(20) : i === 4 ? day(21) : null },
      });
    }
    await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "fremmed", pinnedAt: day(22) } });

    const viewer = { id: anna.id, canAdminister: false };
    const first = await feedPosts(team.id, viewer, { take: 3 });
    // Two pinned, then a full page of three others.
    expect(first.map((p) => p.body)).toEqual(["#4", "#2", "#7", "#6", "#5"]);
    const next = nextFeedCursor(first, 3);
    const second = await feedPosts(team.id, viewer, { take: 3, after: decodeFeedCursor(next!) });
    expect(second.map((p) => p.body)).toEqual(["#3", "#1"]);
    expect(nextFeedCursor(second, 3)).toBeNull();
  });

  it("shows ten at first", async () => {
    const { team, anna } = await makeSquad();
    await prisma.post.createMany({ data: Array.from({ length: 15 }, (_, i) => ({ teamId: team.id, authorId: anna.id, body: `${i}` })) });
    expect(await feedPosts(team.id, { id: anna.id, canAdminister: false })).toHaveLength(10);
  });
});

describe("teamFeed", () => {
  it("gives the front page's first page of posts and the roster, of the team asked for and no other", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));
    await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "gammel", createdAt: day(1) } });
    await prisma.post.create({ data: { teamId: team.id, authorId: bo.id, body: "fastgjort", createdAt: day(2), pinnedAt: day(3) } });
    await prisma.post.create({ data: { teamId: team.id, authorId: bo.id, body: "ny", createdAt: day(4) } });
    await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "fremmed", pinnedAt: day(5) } });

    const [posts, roster] = await teamFeed(team.id, anna.id, false);
    expect(posts.map((p) => p.body)).toEqual(["fastgjort", "ny", "gammel"]);
    expect(roster.map((m) => m.userId).sort()).toEqual((await prisma.teamMember.findMany({ where: { teamId: team.id } })).map((m) => m.userId).sort());
    expect(roster.map((m) => m.userId)).not.toContain(other.anna.id);
  });
});

describe("markFeedSeen", () => {
  it("stamps when this person last saw the feed, on this team only", async () => {
    const { team, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    await prisma.teamMember.create({ data: { teamId: other.team.id, userId: anna.id } });
    await signIn(anna);
    const before = Date.now();
    await markFeedSeen();
    const mine = await prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } });
    const theirs = await prisma.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: other.team.id } } });
    expect(mine.feedSeenAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(theirs.feedSeenAt).toBeNull();
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => markFeedSeen());
  });
});

describe("loadFeedPosts", () => {
  it("renders the next page after a cursor, and nothing for a cursor that is not one", async () => {
    const { loadFeedPosts } = await import("@/app/actions/feed");
    const { team, anna } = await makeSquad();
    await prisma.post.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({ teamId: team.id, authorId: anna.id, body: `#${i}`, createdAt: new Date(Date.UTC(2026, 10, 1, i)) })),
    });
    await signIn(anna);
    expect(await loadFeedPosts("nej")).toEqual({ posts: null, next: null });
    expect(await loadFeedPosts(42)).toEqual({ posts: null, next: null });

    const first = await loadFeedPosts("2026-11-01T03:00:00.000Z_0", 2);
    expect(Array.isArray(first.posts) && first.posts.length).toBe(2);
    expect(first.next).toMatch(/^2026-11-01T01:00:00\.000Z_/);
    const last = await loadFeedPosts(first.next, 2);
    expect(Array.isArray(last.posts) && last.posts.length).toBe(1);
    expect(last.next).toBeNull();
  });
});

describe("searchFeed", () => {
  it("finds the team's posts by their words, their author, their poll and their comments, newest first", async () => {
    const { searchFeed } = await import("@/app/actions/feed");
    const { team, anna, bo } = await makeSquad();
    const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12));
    const words = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Husk BENSKINNER på lørdag", createdAt: at(1) } });
    const commented = await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Kampen i går", createdAt: at(2) } });
    await prisma.postComment.create({ data: { postId: commented.id, authorId: bo.id, body: "Mine benskinner er væk" } });
    const pinned = await prisma.post.create({ data: { teamId: team.id, authorId: bo.id, body: "Fast info", createdAt: at(3), pinnedAt: at(3) } });
    await prisma.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Noget helt andet", createdAt: at(4) } });
    await signIn(anna);

    const byWords = await searchFeed("  benskinner ");
    expect(byWords.count).toBe(2);
    expect(byWords.limited).toBe(false);
    expect(Array.isArray(byWords.posts) && byWords.posts.map((p) => (p as { key: string }).key)).toEqual([commented.id, words.id]);
    // The author's name finds their posts, pinned ones too, in the same list.
    const byAuthor = await searchFeed("bo");
    expect(Array.isArray(byAuthor.posts) && byAuthor.posts.map((p) => (p as { key: string }).key)).toEqual([pinned.id]);
  });

  it("finds a poll by its question and its answers", async () => {
    const { searchFeed } = await import("@/app/actions/feed");
    const { team, anna } = await makeSquad();
    await makePoll(team.id, anna.id, { texts: ["Fredag", "Lørdag"] });
    await signIn(anna);
    expect((await searchFeed("der fest")).count).toBe(1);
    expect((await searchFeed("LØRDAG")).count).toBe(1);
  });

  it("never finds another team's posts, and asks nothing for too little to search for", async () => {
    const { searchFeed } = await import("@/app/actions/feed");
    const { anna } = await makeSquad();
    const other = await makeSquad("Rivalerne");
    await prisma.post.create({ data: { teamId: other.team.id, authorId: other.anna.id, body: "Hemmelig taktik" } });
    await signIn(anna);
    expect((await searchFeed("taktik")).count).toBe(0);
    expect(await searchFeed("t")).toEqual({ posts: null, count: 0, limited: false });
    expect(await searchFeed(42)).toEqual({ posts: null, count: 0, limited: false });
  });

  it("is refused without a session", async () => {
    const { searchFeed } = await import("@/app/actions/feed");
    await makeSquad();
    await expectRedirectToLogin(() => searchFeed("noget"));
  });
});
