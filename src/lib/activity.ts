import type { ActivityKind } from "@prisma/client";

/** An activity is a `Match` row: a match, a training, or anything else on the calendar. */
export const KIND_LABEL: Record<ActivityKind, string> = {
  MATCH: "Kamp",
  TRAINING: "Træning",
  OTHER: "Aktivitet",
};

/** What an activity is called in a list: the opponent for a match, else its title. */
export function activityName(activity: { kind: ActivityKind; title: string; opponent: string | null }) {
  return activity.kind === "MATCH" && activity.opponent ? activity.opponent : activity.title;
}

/**
 * Who has answered a hand-made activity and how, against the roster: those coming, those
 * not, and those yet to answer — each by name, as the roster sorts them. An answer from
 * somebody who has since left the team is left out.
 */
export function signupSummary<M extends { userId: string }>(
  roster: M[],
  signups: { userId: string; going: boolean }[],
) {
  const answers = new Map(signups.map((s) => [s.userId, s.going]));
  return {
    going: roster.filter((m) => answers.get(m.userId) === true),
    notGoing: roster.filter((m) => answers.get(m.userId) === false),
    unanswered: roster.filter((m) => !answers.has(m.userId)),
  };
}
