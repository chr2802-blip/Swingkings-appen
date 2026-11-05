import { describe, expect, it } from "vitest";
import { checkVote, cleanOptions, isOpen, tally } from "@/lib/polls";
import { pollView } from "@/lib/feed";

const now = new Date("2026-11-05T12:00:00Z");
const base = { closedAt: null, closesAt: null, anonymous: false, multipleChoice: false, optionIds: ["a", "b", "c"] };

describe("polls", () => {
  it("is open until closed or past its closing time", () => {
    expect(isOpen({ closedAt: null, closesAt: null }, now)).toBe(true);
    expect(isOpen({ closedAt: null, closesAt: new Date("2026-11-05T11:59:00Z") }, now)).toBe(false);
    expect(isOpen({ closedAt: new Date("2026-11-01"), closesAt: null }, now)).toBe(false);
  });

  it("takes one answer in a single-choice poll, several in a multiple-choice one", () => {
    expect(checkVote(base, ["a"], false, now)).toEqual({ ok: true, optionIds: ["a"] });
    expect(checkVote(base, ["a", "b"], false, now)).toMatchObject({ ok: false });
    expect(checkVote({ ...base, multipleChoice: true }, ["a", "b", "a"], false, now)).toEqual({ ok: true, optionIds: ["a", "b"] });
    expect(checkVote(base, [], false, now)).toMatchObject({ ok: false });
    expect(checkVote(base, ["x"], false, now)).toMatchObject({ ok: false });
  });

  it("lets an open poll be re-voted but an anonymous one only once", () => {
    expect(checkVote(base, ["b"], true, now)).toMatchObject({ ok: true });
    expect(checkVote({ ...base, anonymous: true }, ["b"], true, now)).toMatchObject({ ok: false });
  });

  it("refuses a vote in a closed poll", () => {
    expect(checkVote({ ...base, closedAt: now }, ["a"], false, now)).toMatchObject({ ok: false });
  });

  it("counts shares of ballots and marks the leaders", () => {
    expect(tally(["a", "b", "c"], [{ optionId: "a" }, { optionId: "b" }, { optionId: "a" }], 3)).toEqual([
      { optionId: "a", votes: 2, share: 2 / 3, leading: true },
      { optionId: "b", votes: 1, share: 1 / 3, leading: false },
      { optionId: "c", votes: 0, share: 0, leading: false },
    ]);
    expect(tally(["a"], [], 0)[0]).toMatchObject({ leading: false, share: 0 });
  });

  it("cleans typed answers", () => {
    expect(cleanOptions([" Fredag ", "", "fredag", "Lørdag"])).toEqual(["Fredag", "Lørdag"]);
  });
});

describe("pollView", () => {
  const person = (id: string) => ({ id, name: id.toUpperCase(), photoId: null });
  const row = (anonymous: boolean) => ({
    id: "p",
    question: "Kampens spiller",
    anonymous,
    multipleChoice: false,
    closesAt: null,
    closedAt: null,
    match: null,
    options: [
      { id: "a", text: "Anna", playerId: "anna", player: { photoId: null } },
      { id: "b", text: "Bo", playerId: "bo", player: { photoId: null } },
    ],
    votes: anonymous
      ? [
          { optionId: "a", voterId: null, voter: null },
          { optionId: "a", voterId: null, voter: null },
        ]
      : [
          { optionId: "a", voterId: "carl", voter: person("carl") },
          { optionId: "a", voterId: "dan", voter: person("dan") },
        ],
    ballots: [{ userId: "carl" }, { userId: "dan" }],
  });

  it("names the voters of an open poll once the viewer has voted", () => {
    const view = pollView(row(false), "anna", { id: "carl", canAdminister: false }, now);
    expect(view.options[0]).toMatchObject({ votes: 2, leading: true });
    expect(view.options[0]!.voters.map((v) => v.id)).toEqual(["carl", "dan"]);
    expect(view.myChoices).toEqual(["a"]);
  });

  it("never names anybody in an anonymous poll", () => {
    const view = pollView(row(true), "anna", { id: "carl", canAdminister: true }, now);
    expect(view.hasVoted).toBe(true);
    expect(view.options[0]).toMatchObject({ votes: 2, voters: [] });
    expect(view.myChoices).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/carl|dan/);
  });

  it("hides results from somebody who has not voted while the poll is open", () => {
    const view = pollView(row(false), "anna", { id: "erik", canAdminister: false }, now);
    expect(view.options.every((o) => o.votes === 0 && o.voters.length === 0)).toBe(true);
    expect(view.ballots).toBe(2);
  });
});
