import { describe, expect, it } from "vitest";
import { pollView, sortByVotes } from "@/lib/feed";

const now = new Date("2026-11-11T12:00:00Z");
const anna = { id: "anna", name: "Anna", photoId: null };
const bo = { id: "bo", name: "Bo", photoId: "p" };

function poll(overrides: Partial<Parameters<typeof pollView>[0]> = {}): Parameters<typeof pollView>[0] {
  return {
    id: "poll",
    question: "Kampens spiller?",
    anonymous: false,
    multipleChoice: false,
    closesAt: null,
    closedAt: null,
    hideResults: false,
    resultsShownAt: null,
    match: null,
    options: [
      { id: "o1", text: "Anna", playerId: "anna", player: { photoId: null } },
      { id: "o2", text: "Bo", playerId: null, player: null },
    ],
    votes: [
      { optionId: "o1", voterId: "anna", voter: anna },
      { optionId: "o1", voterId: "bo", voter: bo },
    ],
    ballots: [{ userId: "anna" }, { userId: "bo" }],
    ...overrides,
  };
}

describe("pollView", () => {
  it("sends no result to somebody who has not voted while the poll is open", () => {
    const view = pollView(poll(), "anna", { id: "carl", canAdminister: false }, now);
    expect(view).toMatchObject({ open: true, hasVoted: false, ballots: 2, canClose: false });
    expect(view.options.map((o) => [o.votes, o.share, o.leading, o.voters])).toEqual([
      [0, 0, false, []],
      [0, 0, false, []],
    ]);
    // Who has voted is told, each once and by name — but not what they chose.
    expect(view.voters).toEqual([anna, bo]);
    expect(view.myChoices).toEqual([]);
  });

  it("names each voter once however many answers they ticked", () => {
    const several = poll({
      multipleChoice: true,
      votes: [
        { optionId: "o2", voterId: "bo", voter: bo },
        { optionId: "o1", voterId: "bo", voter: bo },
        { optionId: "o1", voterId: "anna", voter: anna },
      ],
    });
    expect(pollView(several, "anna", { id: "carl", canAdminister: false }, now).voters).toEqual([anna, bo]);
  });

  it("shows a voter the counts, the shares and who voted for what", () => {
    const view = pollView(poll(), "anna", { id: "bo", canAdminister: false }, now);
    expect(view.myChoices).toEqual(["o1"]);
    expect(view.options[0]).toMatchObject({ votes: 2, leading: true, isPlayer: true, voters: [anna, bo] });
    expect(view.options[1]).toMatchObject({ votes: 0, isPlayer: false });
  });

  it("shows everybody the result once closed, but never the voters of an anonymous poll", () => {
    const anonymous = poll({
      anonymous: true,
      closedAt: new Date("2026-11-10T00:00:00Z"),
      votes: [
        { optionId: "o1", voterId: null, voter: null },
        { optionId: "o2", voterId: null, voter: null },
      ],
    });
    const view = pollView(anonymous, "anna", { id: "carl", canAdminister: true }, now);
    expect(view).toMatchObject({ open: false, myChoices: [], canClose: true, voters: [] });
    expect(view.options.map((o) => [o.votes, o.voters])).toEqual([
      [1, []],
      [1, []],
    ]);
    expect(JSON.stringify(view)).not.toContain("anna\"");
  });

  it("puts the most votes first once the result is shown, ties in the written order", () => {
    const three = poll({
      options: [
        { id: "o1", text: "Anna", playerId: null, player: null },
        { id: "o2", text: "Bo", playerId: null, player: null },
        { id: "o3", text: "Carl", playerId: null, player: null },
      ],
      votes: [
        { optionId: "o3", voterId: "anna", voter: anna },
        { optionId: "o3", voterId: "bo", voter: bo },
      ],
    });
    expect(pollView(three, "anna", { id: "bo", canAdminister: false }, now).options.map((o) => o.id)).toEqual(["o3", "o1", "o2"]);
    // Before voting nothing is counted, so nothing gives the leader away.
    expect(pollView(three, "anna", { id: "carl", canAdminister: false }, now).options.map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
    expect(sortByVotes([{ votes: 1, n: "a" }, { votes: 3, n: "b" }, { votes: 1, n: "c" }]).map((o) => o.n)).toEqual(["b", "a", "c"]);
  });

  it("keeps a hidden result from everybody — voter, maker and admin, open or closed — until it is shown", () => {
    const hidden = poll({ hideResults: true });
    for (const viewer of [
      { id: "bo", canAdminister: false }, // has voted
      { id: "anna", canAdminister: false }, // made it, and voted
      { id: "carl", canAdminister: true }, // admin
    ]) {
      const view = pollView(hidden, "anna", viewer, now);
      expect(view.resultsHidden).toBe(true);
      expect(view.options.map((o) => [o.votes, o.share, o.leading, o.voters])).toEqual([
        [0, 0, false, []],
        [0, 0, false, []],
      ]);
    }
    // Only the maker and the admins may show it.
    expect(pollView(hidden, "anna", { id: "anna", canAdminister: false }, now).canShowResults).toBe(true);
    expect(pollView(hidden, "anna", { id: "carl", canAdminister: true }, now).canShowResults).toBe(true);
    expect(pollView(hidden, "anna", { id: "bo", canAdminister: false }, now).canShowResults).toBe(false);
    // The voter still sees what they chose themselves, and who has voted.
    const mine = pollView(hidden, "anna", { id: "bo", canAdminister: false }, now);
    expect(mine.myChoices).toEqual(["o1"]);
    expect(mine.voters).toEqual([anna, bo]);

    // Closing does not show it.
    const closed = pollView(poll({ hideResults: true, closedAt: new Date("2026-11-10T00:00:00Z") }), "anna", { id: "carl", canAdminister: false }, now);
    expect(closed.options[0]).toMatchObject({ votes: 0, leading: false });

    // Shown: the usual rule again — the result to voters, and to everybody once closed.
    const shown = poll({ hideResults: true, resultsShownAt: new Date("2026-11-11T11:00:00Z") });
    const voter = pollView(shown, "anna", { id: "bo", canAdminister: false }, now);
    expect(voter).toMatchObject({ resultsHidden: false, canShowResults: false });
    expect(voter.options[0]).toMatchObject({ votes: 2, voters: [anna, bo] });
    expect(pollView(shown, "anna", { id: "carl", canAdminister: false }, now).options[0]).toMatchObject({ votes: 0 });
  });

  it("hides an anonymous poll's result too, until it is shown", () => {
    const anonymous = poll({
      anonymous: true,
      hideResults: true,
      closedAt: new Date("2026-11-10T00:00:00Z"),
      votes: [
        { optionId: "o1", voterId: null, voter: null },
        { optionId: "o1", voterId: null, voter: null },
      ],
    });
    expect(pollView(anonymous, "anna", { id: "anna", canAdminister: true }, now).options[0]).toMatchObject({ votes: 0, share: 0 });
    const shown = pollView({ ...anonymous, resultsShownAt: new Date("2026-11-11T00:00:00Z") }, "anna", { id: "carl", canAdminister: false }, now);
    expect(shown.options[0]).toMatchObject({ votes: 2, voters: [] });
  });

  it("labels the closing time and the match", () => {
    const view = pollView(
      poll({ closesAt: new Date("2026-11-20T18:00:00Z"), match: { opponent: "B.93", title: "x", startsAt: new Date("2026-11-21T13:00:00Z") } }),
      "anna",
      { id: "anna", canAdminister: false },
      now,
    );
    expect(view.closesLabel).toMatch(/^Slutter 20\. nov\.? kl\. 19:00$/);
    expect(view.matchLabel).toMatch(/^B\.93 · /);
  });
});
