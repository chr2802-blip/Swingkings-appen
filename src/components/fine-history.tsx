import type { challengeRowSelect, fineHistory } from "@/lib/fine-data";
import type { Prisma } from "@prisma/client";
import { firstName } from "@/lib/names";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { relativeDay } from "@/lib/time";
import { Badge, Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { FineSheet } from "@/components/fine-sheet";
import { Star } from "@/components/crest";
import type { ChallengeStatus } from "@prisma/client";

export type HistoryFine = Awaited<ReturnType<typeof fineHistory>>[number];
/** A challenge as its row reads it (`challengeRowSelect`); its sheet reads the rest when opened. */
export type HistoryChallenge = Prisma.ChallengeGetPayload<{ select: typeof challengeRowSelect }>;

/** A row of the history: a fine, or a challenge (one still waiting has no fine yet). */
export type HistoryItem =
  | { kind: "fine"; at: Date; fine: HistoryFine }
  | { kind: "challenge"; at: Date; challenge: HistoryChallenge };

/**
 * Fines and challenges as one list, newest first. A challenge still waiting has moved
 * nothing yet, so it stands in the history as itself until it is approved; then its fines
 * stand there instead.
 */
export function historyItems(fines: HistoryFine[], challenges: HistoryChallenge[] = []): HistoryItem[] {
  return [
    ...fines.map((fine) => ({ kind: "fine" as const, at: fine.createdAt, fine })),
    ...challenges.map((challenge) => ({ kind: "challenge" as const, at: challenge.createdAt, challenge })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * One fine as a row — the only way a fine is drawn in a list: who (the first name and the
 * picture, or the initials, are enough; the reason gets the room), what for, how much. A tap
 * opens the fine, or the challenge it came from, with everything known about it, and
 * "Slet" for whoever may (`FineDetails`). The sheet is fetched when it is opened: drawn
 * beforehand for every row, it was most of the fine box's page, and nearly never looked at.
 */
export function FineRow({ fine }: { fine: HistoryFine }) {
  return (
    // `data-fresh`: a fine just given, or one a challenge just moved, pulses here (`FreshPulse`).
    <li data-fresh={[fine.id, fine.challengeId].filter(Boolean).join(" ")}>
      <FineSheet
        fineId={fine.id}
        title={fine.challengeId ? "Udfordring" : "Bøde"}
        triggerClassName="press-card flex w-full items-center gap-3 px-4 py-3 text-left"
        trigger={
          <>
            {/* The icon says which it is: a fine given (star) or a challenge's (swords). */}
            {fine.challengeId ? (
              <span className="w-3.5 text-center text-sm">
                <span aria-hidden>⚔️</span>
                <span className="sr-only">Udfordring</span>
              </span>
            ) : (
              <span className="flex">
                <Star className="h-3.5 w-3.5" />
                <span className="sr-only">Bøde</span>
              </span>
            )}
            <Avatar name={fine.player.name} photoId={fine.player.photoId} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {firstName(fine.player.name)} <span className="font-normal text-slate-500">· {fine.reason}</span>
              </span>
              <span className="block text-xs text-slate-500">
                {fineUnits(fine.units)} · {kr(fineAmount(fine))} · {relativeDay(fine.createdAt)}
              </span>
            </span>
            <span aria-hidden className="text-slate-300">
              ›
            </span>
          </>
        }
      />
    </li>
  );
}

const CHALLENGE_SHORT: Record<ChallengeStatus, string> = {
  PENDING: "Venter",
  SETTLED: "Godkendt",
};
const CHALLENGE_TONE: Record<ChallengeStatus, "amber" | "green"> = {
  PENDING: "amber",
  SETTLED: "green",
};

/**
 * A challenge still waiting, as a row beside the fines: the first names, what and the stake.
 * Tapped, it opens in full — fetched then, as a fine's sheet is — with "Godkend" for whoever
 * may. `data-fresh` (`challenge:<id>`): one just reported pulses here; the bare id is its
 * fines', once approved.
 */
export function ChallengeRow({ challenge: c, finePriceKr }: { challenge: HistoryChallenge; finePriceKr: number }) {
  return (
    <li data-fresh={`challenge:${c.id}`}>
      <FineSheet
        fineId={c.id}
        kind="challenge"
        title="Udfordring"
        triggerClassName="press-card flex w-full items-center gap-3 px-4 py-3 text-left"
        trigger={
          <>
            <span className="w-3.5 text-center text-sm">
              <span aria-hidden>⚔️</span>
              <span className="sr-only">Udfordring</span>
            </span>
            <Avatar name={c.winner.name} photoId={c.winner.photoId} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                <span className="font-medium">{firstName(c.winner.name)} 🏆</span> slog {firstName(c.loser.name)}
                <span className="text-slate-500"> · {c.description}</span>
              </span>
              <span className="block truncate text-xs text-slate-500">
                {fineUnits(c.units)} · {kr(c.units * finePriceKr)} · {relativeDay(c.createdAt)}
              </span>
            </span>
            <Badge tone={CHALLENGE_TONE[c.status]}>{CHALLENGE_SHORT[c.status]}</Badge>
          </>
        }
      />
    </li>
  );
}

/** The history: fines and challenges as rows, in the order given (`historyItems`). */
export function FineHistory({ items, finePriceKr }: { items: HistoryItem[]; finePriceKr: number }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-slate-100">
        {items.map((item) =>
          item.kind === "fine" ? (
            <FineRow key={item.fine.id} fine={item.fine} />
          ) : (
            <ChallengeRow key={item.challenge.id} challenge={item.challenge} finePriceKr={finePriceKr} />
          ),
        )}
      </ul>
    </Card>
  );
}
