import type { Prisma, ReactionKind } from "@prisma/client";

/** The reactions on offer, in the order they are offered and shown. */
export const REACTIONS: readonly { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "THUMBS", emoji: "👍", label: "Synes godt om" },
  { kind: "HEART", emoji: "❤️", label: "Elsker" },
  { kind: "LAUGH", emoji: "😂", label: "Griner" },
  { kind: "WOW", emoji: "😮", label: "Wow" },
  { kind: "SAD", emoji: "😢", label: "Ked af det" },
  { kind: "FIRE", emoji: "🔥", label: "Ild" },
];

export const REACTION_KINDS = REACTIONS.map((r) => r.kind) as [ReactionKind, ...ReactionKind[]];

/** What a reaction can be on, as the form names it. */
export const REACTION_TARGETS = ["post", "comment", "chat", "activityComment"] as const;
export type ReactionTarget = (typeof REACTION_TARGETS)[number];

/** The rows to read for `reactionSummary` and `reactorsView`: first to react first. */
export const reactionRows = {
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  select: { kind: true, userId: true, user: { select: { name: true, photoId: true } } },
} satisfies Prisma.ReactionFindManyArgs;

type Row = { kind: ReactionKind; userId: string; user: { name: string } };

/** One kind of reaction on a thing, as it is drawn: the emoji, how many, whether the viewer is one, and who. */
export type ReactionView = { kind: ReactionKind; emoji: string; label: string; count: number; mine: boolean; names: string[] };

/**
 * The reactions on one thing, a kind per entry, in the order they are offered; a kind
 * nobody has given is left out. Names in the order they reacted.
 */
export function reactionSummary(rows: Row[], viewerId: string): ReactionView[] {
  return REACTIONS.flatMap(({ kind, emoji, label }) => {
    const given = rows.filter((row) => row.kind === kind);
    if (given.length === 0) return [];
    return [{ kind, emoji, label, count: given.length, mine: given.some((row) => row.userId === viewerId), names: given.map((row) => row.user.name) }];
  });
}

/** "Anna", "Anna og Bo", "Anna, Bo og Carl". */
export function nameList(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} og ${names.at(-1)}` : (names[0] ?? "");
}

/** A post shows this many of the faces that reacted to it; the rest are a number. */
export const REACTORS_SHOWN = 5;

/**
 * Who reacted to a post, as the feed shows it: each person once, first to react first,
 * with the emojis they gave; the first few as faces and the rest counted, and one sentence
 * naming them for somebody who cannot see the faces.
 */
export function reactorsView(rows: (Row & { user: { photoId: string | null } })[], shown = REACTORS_SHOWN) {
  const people = new Map<string, { id: string; name: string; photoId: string | null; emojis: string[] }>();
  for (const row of rows) {
    const person = people.get(row.userId) ?? { id: row.userId, name: row.user.name, photoId: row.user.photoId, emojis: [] };
    person.emojis.push(REACTIONS.find((r) => r.kind === row.kind)!.emoji);
    people.set(row.userId, person);
  }
  for (const person of people.values()) {
    person.emojis.sort((a, b) => REACTIONS.findIndex((r) => r.emoji === a) - REACTIONS.findIndex((r) => r.emoji === b));
  }
  const everybody = [...people.values()];
  const faces = everybody.slice(0, shown);
  const more = everybody.length - faces.length;
  const names = faces.map((person) => person.name);
  const list = more > 0 ? `${names.join(", ")} og ${more} mere` : nameList(names);
  return { people: everybody, faces, more, label: list ? `${list} har reageret` : "" };
}

/** The list as it is once the viewer has given (`on`) or taken back one kind; "Dig" stands in for their name until the server answers. */
export function applyPress(list: ReactionView[], kind: ReactionKind, on: boolean): ReactionView[] {
  const existing = list.find((r) => r.kind === kind);
  if (on) {
    if (existing?.mine) return list;
    if (existing) return list.map((r) => (r.kind === kind ? { ...r, count: r.count + 1, mine: true, names: [...r.names, "Dig"] } : r));
    const meta = REACTIONS.find((r) => r.kind === kind)!;
    const added: ReactionView = { kind, emoji: meta.emoji, label: meta.label, count: 1, mine: true, names: ["Dig"] };
    return [...list, added].sort((a, b) => order(a.kind) - order(b.kind));
  }
  if (!existing?.mine) return list;
  if (existing.count === 1) return list.filter((r) => r.kind !== kind);
  // Which name was the viewer's is not known here; the last one goes until the server says.
  return list.map((r) => (r.kind === kind ? { ...r, count: r.count - 1, mine: false, names: r.names.slice(0, -1) } : r));
}

function order(kind: ReactionKind) {
  return REACTIONS.findIndex((r) => r.kind === kind);
}
