import { describe, expect, it } from "vitest";
import { pollView } from "@/lib/feed";

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
    expect(view).toMatchObject({ open: false, myChoices: [], canClose: true });
    expect(view.options.map((o) => [o.votes, o.voters])).toEqual([
      [1, []],
      [1, []],
    ]);
    expect(JSON.stringify(view)).not.toContain("anna\"");
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
