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

/** Somebody on a sign-up list: a teammate when the name is on the roster, else just the name. */
export type SignupPerson = { key: string; name: string; userId: string | null; photoId: string | null };

function foldName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9æøå ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** What `Match.externalSignups` holds, read defensively: it is the feed's, written as JSON. */
export function readExternalSignups(value: unknown): { going: string[]; notGoing: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const list = (key: string) => {
    const raw = (value as Record<string, unknown>)[key];
    return Array.isArray(raw) ? raw.filter((n): n is string => typeof n === "string" && n.trim() !== "") : [];
  };
  return { going: list("going"), notGoing: list("notGoing") };
}

/**
 * KampKlar's sign-ups, by name, put against the roster so a teammate shows with their
 * picture and links to their page. A name is a teammate when it is theirs in full
 * (accents and case aside), or when it is the first name of exactly one of them — and
 * KampKlar says nothing about one of ours, so nobody is matched twice. A name that is
 * nobody's here is still listed. Whoever on the roster is in neither list has not answered.
 */
export function externalSignupSummary<M extends { userId: string; name: string; photoId: string | null }>(
  roster: M[],
  signups: { going: string[]; notGoing: string[] },
) {
  const taken = new Set<string>();
  const byFull = new Map(roster.map((m) => [foldName(m.name), m]));
  const firstNames = new Map<string, M[]>();
  for (const m of roster) {
    const first = foldName(m.name).split(" ")[0] ?? "";
    firstNames.set(first, [...(firstNames.get(first) ?? []), m]);
  }
  const find = (name: string) => {
    const folded = foldName(name);
    const full = byFull.get(folded);
    if (full && !taken.has(full.userId)) return full;
    const firsts = !folded.includes(" ") ? firstNames.get(folded) : undefined;
    return firsts?.length === 1 && !taken.has(firsts[0]!.userId) ? firsts[0] : undefined;
  };
  const toPeople = (names: string[], prefix: string): SignupPerson[] =>
    names.map((name, index) => {
      const member = find(name);
      if (member) taken.add(member.userId);
      return member
        ? { key: member.userId, name: member.name, userId: member.userId, photoId: member.photoId }
        : { key: `${prefix}-${index}-${name}`, name, userId: null, photoId: null };
    });
  const going = toPeople(signups.going, "going");
  const notGoing = toPeople(signups.notGoing, "not");
  const unanswered: SignupPerson[] = roster
    .filter((m) => !taken.has(m.userId))
    .map((m) => ({ key: m.userId, name: m.name, userId: m.userId, photoId: m.photoId }));
  return { going, notGoing, unanswered };
}
