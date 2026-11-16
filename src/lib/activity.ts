import type { ActivityKind } from "@prisma/client";
import type { SignupLists, SignupStatus } from "./ical";
import { readInZone } from "./time";

/** An activity is a `Match` row: a match, a training, or anything else on the calendar. */
export const KIND_LABEL: Record<ActivityKind, string> = {
  MATCH: "Kamp",
  TRAINING: "Træning",
  OTHER: "Aktivitet",
};

/** What an activity is called in a list: the opponent for a match, else its title. */
export function activityName(activity: {
  kind: ActivityKind;
  title: string;
  opponent: string | null;
}) {
  return activity.kind === "MATCH" && activity.opponent
    ? activity.opponent
    : activity.title;
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

/** Somebody on a sign-up list: a teammate when the name is on the roster, else just the name. */
export type SignupPerson = {
  key: string;
  name: string;
  userId: string | null;
  photoId: string | null;
};

function foldName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9æøå ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What `Match.externalSignups` holds, read defensively: it is the feed's, written as JSON. */
export function readExternalSignups(value: unknown): SignupLists | null {
  if (!value || typeof value !== "object") return null;
  const list = (key: string) => {
    const raw = (value as Record<string, unknown>)[key];
    return Array.isArray(raw)
      ? raw.filter((n): n is string => typeof n === "string" && n.trim() !== "")
      : [];
  };
  // Rows from before "til rådighed" was read have no `available`: nobody was.
  return { going: list("going"), notGoing: list("notGoing"), available: list("available") };
}

/** Whether every word of `short` starts the same word of `long`: "Christian R" fits "Christian Rasmussen". */
function fitsName(short: string[], long: string[]) {
  return short.length > 0 && short.length <= long.length && short.every((word, i) => long[i]!.startsWith(word));
}

/**
 * KampKlar's sign-ups, by name, put against the roster so a teammate shows with their
 * picture and links to their page. A name is matched, in this order, to:
 *
 * 1. the member an admin linked it to (`kampklarName`) — such a member is matched by
 *    nothing else, so a link always wins over a guess;
 * 2. the member with that name in full (accents and case aside);
 * 3. the one member whose name fits it word by word, either way round — "Christian" or
 *    "Christian R" here for "Christian Rasmussen" there, or the reverse — when exactly one does.
 *
 * Nobody is matched twice. A name that is nobody's here is still listed (`userId` null),
 * so an admin can see whom to link. Whoever on the roster is in no list has not answered.
 */
export function externalSignupSummary<
  M extends { userId: string; name: string; photoId: string | null; kampklarName?: string | null },
>(roster: M[], signups: SignupLists) {
  const taken = new Set<string>();
  const words = (name: string) => foldName(name).split(" ").filter(Boolean);
  const linked = new Map(roster.filter((m) => m.kampklarName).map((m) => [foldName(m.kampklarName!), m]));
  const unlinked = roster.filter((m) => !m.kampklarName);
  const find = (name: string) => {
    const folded = foldName(name);
    const free = (m: M | undefined) => (m && !taken.has(m.userId) ? m : undefined);
    const byLink = free(linked.get(folded));
    if (byLink) return byLink;
    const open = unlinked.filter((m) => !taken.has(m.userId));
    const full = open.find((m) => foldName(m.name) === folded);
    if (full) return full;
    const theirs = words(name);
    const fits = open.filter((m) => {
      const ours = words(m.name);
      return fitsName(ours, theirs) || fitsName(theirs, ours);
    });
    return fits.length === 1 ? fits[0] : undefined;
  };
  const toPeople = (names: string[], prefix: string): SignupPerson[] =>
    names.map((name, index) => {
      const member = find(name);
      if (member) taken.add(member.userId);
      return member
        ? {
            key: member.userId,
            name: member.name,
            userId: member.userId,
            photoId: member.photoId,
          }
        : {
            key: `${prefix}-${index}-${name}`,
            name,
            userId: null,
            photoId: null,
          };
    });
  const going = toPeople(signups.going, "going");
  const available = toPeople(signups.available, "available");
  const notGoing = toPeople(signups.notGoing, "not");
  const unanswered: SignupPerson[] = roster
    .filter((m) => !taken.has(m.userId))
    .map((m) => ({
      key: m.userId,
      name: m.name,
      userId: m.userId,
      photoId: m.photoId,
    }));
  return { going, available, notGoing, unanswered };
}

/**
 * How many answered each way, for a row in the activity list: KampKlar's counts from the
 * feed, or the app's own sign-ups for a hand-made activity. Null when nothing is known.
 */
export function signupCounts(activity: {
  source: "MANUAL" | "KAMPKLAR";
  externalSignups: unknown;
  signups: { going: boolean }[];
}): Record<SignupStatus, number> | null {
  if (activity.source === "KAMPKLAR") {
    const lists = readExternalSignups(activity.externalSignups);
    return lists && { going: lists.going.length, available: lists.available.length, notGoing: lists.notGoing.length };
  }
  if (activity.signups.length === 0) return null;
  const going = activity.signups.filter((s) => s.going).length;
  return { going, available: 0, notGoing: activity.signups.length - going };
}

/**
 * The open jobs on the first day one is due: a job is due at its deadline, or else when its
 * activity starts. Several on that day all show; with no day at all, the oldest job.
 */
export function firstDaysTasks<
  T extends { dueAt: Date | null; match: { startsAt: Date } | null },
>(open: T[]): T[] {
  const when = (task: T) => task.dueAt ?? task.match?.startsAt ?? null;
  const dated = open
    .filter((task) => when(task) !== null)
    .sort((a, b) => when(a)!.getTime() - when(b)!.getTime());
  if (dated.length === 0) return open.slice(0, 1);
  const day = readInZone(when(dated[0])!, "yyyy-MM-dd");
  return dated.filter((task) => readInZone(when(task)!, "yyyy-MM-dd") === day);
}
