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
