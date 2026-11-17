import type { Prisma, ReactionKind } from "@prisma/client";

/**
 * The reactions on offer, in the order they are offered and shown. The crown is the
 * crown from the club's crest, drawn rather than typed (`ReactionGlyph`); "👑" stands in
 * for it in words.
 */
export const REACTIONS: readonly { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "CROWN", emoji: "👑", label: "Krone" },
  { kind: "THUMBS", emoji: "👍", label: "Synes godt om" },
  { kind: "HEART", emoji: "❤️", label: "Elsker" },
  { kind: "LAUGH", emoji: "😂", label: "Griner" },
  { kind: "WOW", emoji: "😮", label: "Wow" },
  { kind: "SAD", emoji: "😢", label: "Ked af det" },
  { kind: "FIRE", emoji: "🔥", label: "Ild" },
];

export const REACTION_KINDS = REACTIONS.map((r) => r.kind) as [ReactionKind, ...ReactionKind[]];

/** What a press gives: the crown. The rest are a long press away. */
export const DEFAULT_REACTION: ReactionKind = "CROWN";

/** What a reaction can be on, as the form names it. */
export const REACTION_TARGETS = ["post", "comment", "chat", "activityComment"] as const;
export type ReactionTarget = (typeof REACTION_TARGETS)[number];

/** The rows to read for `reactorsOf`: first to react first. */
export const reactionRows = {
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  select: { kind: true, userId: true, user: { select: { name: true, photoId: true } } },
} satisfies Prisma.ReactionFindManyArgs;

type Row = { kind: ReactionKind; userId: string; user: { name: string; photoId: string | null } };

/** Somebody who reacted to a thing, and with what. What reaches the browser for each post, comment and message. */
export type Reactor = { id: string; name: string; photoId: string | null; kind: ReactionKind };

/**
 * Who reacted to a thing: each person once, first to react first. Should a person still
 * have two (from before one each), the later stands, in the first one's place.
 */
export function reactorsOf(rows: Row[]): Reactor[] {
  const people = new Map<string, Reactor>();
  for (const row of rows) people.set(row.userId, { id: row.userId, name: row.user.name, photoId: row.user.photoId, kind: row.kind });
  return [...people.values()];
}

/** How many gave each kind, most first (ties in the order offered), and the viewer's own. */
export type ReactionTally = {
  total: number;
  kinds: { kind: ReactionKind; count: number }[];
  /** The kinds drawn stacked beside the total: the three most given. */
  top: ReactionKind[];
  mine: ReactionKind | null;
};

export function tallyReactions(reactors: Reactor[], viewerId: string): ReactionTally {
  const kinds = REACTIONS.map(({ kind }) => ({ kind, count: reactors.filter((r) => r.kind === kind).length }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count || order(a.kind) - order(b.kind));
  return {
    total: reactors.length,
    kinds,
    top: kinds.slice(0, 3).map((k) => k.kind),
    mine: reactors.find((r) => r.id === viewerId)?.kind ?? null,
  };
}

/** "Anna", "Anna og Bo", "Anna, Bo og Carl". */
export function nameList(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} og ${names.at(-1)}` : (names[0] ?? "");
}

/** Named in words, at most this many; the rest are a number. */
export const NAMES_SHOWN = 3;

/** One sentence for somebody who cannot see the icons: "Anna, Bo og 2 mere har reageret". */
export function reactorsLabel(reactors: Reactor[], shown = NAMES_SHOWN): string {
  if (reactors.length === 0) return "";
  const names = reactors.slice(0, shown).map((r) => r.name);
  const more = reactors.length - names.length;
  return `${more > 0 ? `${names.join(", ")} og ${more} mere` : nameList(names)} har reageret`;
}

/**
 * Who reacted once the viewer has chosen `kind` (`on`) — in place of whatever they had —
 * or taken it back. The viewer keeps their place in the order; new, they come last, as
 * "Dig" until the server answers with their name.
 */
export function pressReaction(reactors: Reactor[], viewerId: string, kind: ReactionKind, on: boolean): Reactor[] {
  const mine = reactors.find((r) => r.id === viewerId);
  if (on) {
    if (mine?.kind === kind) return reactors;
    return mine ? reactors.map((r) => (r.id === viewerId ? { ...r, kind } : r)) : [...reactors, { id: viewerId, name: "Dig", photoId: null, kind }];
  }
  return mine?.kind === kind ? reactors.filter((r) => r.id !== viewerId) : reactors;
}

function order(kind: ReactionKind) {
  return REACTIONS.findIndex((r) => r.kind === kind);
}
