import { describe, expect, it } from "vitest";
import { readPollForm } from "@/lib/poll-form";
import { formData } from "../helpers/factories";

const roster = [
  { userId: "anna", name: "Anna" },
  { userId: "bo", name: "Bo" },
];
const now = new Date("2026-06-01T10:00:00Z");

describe("readPollForm", () => {
  it("reads no poll when the form has none", () => {
    expect(readPollForm(formData({ body: "Hej" }), roster, now)).toEqual({ ok: true, poll: null });
  });

  it("reads typed answers, cleaned, with the choices fixed when it is made", () => {
    const read = readPollForm(
      formData({ withPoll: "on", pollQuestion: "Hvornår?", pollOption: [" Fredag ", "", "Lørdag"], pollAnonymous: "on", pollHideResults: "on" }),
      roster,
      now,
    );
    expect(read).toEqual({
      ok: true,
      poll: {
        question: "Hvornår?",
        anonymous: true,
        multipleChoice: false,
        hideResults: true,
        closesAt: null,
        matchId: null,
        options: [
          { text: "Fredag", playerId: null },
          { text: "Lørdag", playerId: null },
        ],
      },
    });
  });

  it("takes the players ticked on the roster, and refuses one who is not on it", () => {
    const picked = readPollForm(
      formData({ withPoll: "on", pollQuestion: "Kampens spiller", pollKind: "players", pollPickPlayers: "on", pollPlayerId: ["anna", "bo"] }),
      roster,
      now,
    );
    expect(picked.ok && picked.poll?.options).toEqual([
      { text: "Anna", playerId: "anna" },
      { text: "Bo", playerId: "bo" },
    ]);
    expect(
      readPollForm(formData({ withPoll: "on", pollQuestion: "?", pollKind: "players", pollPickPlayers: "on", pollPlayerId: ["anna", "fremmed"] }), roster, now),
    ).toEqual({ ok: false, error: "Spilleren er ikke på holdet." });
  });

  it("takes only typed answers on a club post, and names no match there", () => {
    expect(readPollForm(formData({ withPoll: "on", pollQuestion: "?", pollKind: "players" }), null, now)).toEqual({
      ok: false,
      error: "En klubafstemning har skrevne svar.",
    });
    const club = readPollForm(formData({ withPoll: "on", pollQuestion: "?", pollOption: ["Ja", "Nej"], pollMatchId: "kamp" }), null, now);
    expect(club.ok && club.poll?.matchId).toBeNull();
    const team = readPollForm(formData({ withPoll: "on", pollQuestion: "?", pollOption: ["Ja", "Nej"], pollMatchId: "kamp" }), roster, now);
    expect(team.ok && team.poll?.matchId).toBe("kamp");
  });

  it("refuses too few answers and an end that has passed", () => {
    expect(readPollForm(formData({ withPoll: "on", pollQuestion: "?", pollOption: ["Kun én"] }), roster, now)).toEqual({
      ok: false,
      error: "En afstemning skal have mindst to svarmuligheder.",
    });
    expect(
      readPollForm(formData({ withPoll: "on", pollQuestion: "?", pollOption: ["Ja", "Nej"], pollClosesAt: "2026-05-01T12:00" }), roster, now),
    ).toEqual({ ok: false, error: "Sluttidspunktet skal ligge ude i fremtiden." });
    expect(readPollForm(formData({ withPoll: "on", pollQuestion: "", pollOption: ["Ja", "Nej"] }), roster, now)).toEqual({
      ok: false,
      error: "Skriv spørgsmålet til afstemningen.",
    });
  });
});
