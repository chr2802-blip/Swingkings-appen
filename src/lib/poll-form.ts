import { z } from "zod";
import { optionalId, readForm } from "./form";
import { cleanOptions, MAX_POLL_OPTIONS } from "./polls";
import { parseLocalDateTime } from "./time";

const pollSchema = z.object({
  pollQuestion: z.string().trim().min(1, "Skriv spørgsmålet til afstemningen.").max(200),
  pollKind: z.enum(["custom", "players"]).default("custom"),
  /** "on" when the players were picked from the roster; otherwise every player is an answer. */
  pollPickPlayers: z.enum(["on", "off"]).default("off"),
  pollAnonymous: z.enum(["on", "off"]).default("off"),
  pollHideResults: z.enum(["on", "off"]).default("off"),
  pollMultiple: z.enum(["on", "off"]).default("off"),
  pollClosesAt: z.string().trim().optional(),
  pollMatchId: optionalId,
});

export type PollChoice = {
  question: string;
  anonymous: boolean;
  multipleChoice: boolean;
  hideResults: boolean;
  closesAt: Date | null;
  matchId: string | null;
  options: { text: string; playerId: string | null }[];
};

/**
 * The poll a post form carries (`withPoll` "on"), or null for none. Its answers are typed,
 * or players on the roster — the ones ticked (`pollPlayerId`), or all of them. `roster` is
 * null where players are no answer (a club post, shown to several teams): there only typed
 * answers are taken. Whether it is anonymous, and whether its result is hidden until shown
 * by hand, is fixed here. The match it names, if any, is the caller's to look up.
 */
export function readPollForm(
  formData: FormData,
  roster: { userId: string; name: string }[] | null,
  now: Date = new Date(),
): { ok: true; poll: PollChoice | null } | { ok: false; error: string } {
  if (formData.get("withPoll") !== "on") return { ok: true, poll: null };
  const form = readForm(pollSchema, formData);
  if (!form.ok) return form;
  let options: { text: string; playerId: string | null }[];
  if (form.fields.pollKind === "players") {
    if (!roster) return { ok: false, error: "En klubafstemning har skrevne svar." };
    let chosen = roster;
    if (form.fields.pollPickPlayers === "on") {
      const picked = new Set(formData.getAll("pollPlayerId").map(String).filter(Boolean));
      if ([...picked].some((id) => !roster.some((m) => m.userId === id))) return { ok: false, error: "Spilleren er ikke på holdet." };
      chosen = roster.filter((m) => picked.has(m.userId));
    }
    options = chosen.map((m) => ({ text: m.name, playerId: m.userId }));
  } else {
    options = cleanOptions(formData.getAll("pollOption").map(String)).map((t) => ({ text: t, playerId: null }));
  }
  if (options.length < 2) return { ok: false, error: "En afstemning skal have mindst to svarmuligheder." };
  if (options.length > MAX_POLL_OPTIONS) return { ok: false, error: `Højst ${MAX_POLL_OPTIONS} svarmuligheder.` };
  let closesAt: Date | null = null;
  if (form.fields.pollClosesAt) {
    closesAt = parseLocalDateTime(form.fields.pollClosesAt);
    if (!closesAt) return { ok: false, error: "Sluttidspunktet kunne ikke læses." };
    if (closesAt <= now) return { ok: false, error: "Sluttidspunktet skal ligge ude i fremtiden." };
  }
  return {
    ok: true,
    poll: {
      question: form.fields.pollQuestion,
      anonymous: form.fields.pollAnonymous === "on",
      multipleChoice: form.fields.pollMultiple === "on",
      hideResults: form.fields.pollHideResults === "on",
      closesAt,
      matchId: roster ? form.fields.pollMatchId : null,
      options,
    },
  };
}
