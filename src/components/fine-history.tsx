import type { fineHistory } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { relativeDay } from "@/lib/time";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { FineSheet } from "@/components/fine-sheet";
import { Star } from "@/components/crest";

export type HistoryFine = Awaited<ReturnType<typeof fineHistory>>[number];

/**
 * One fine as a row — the only way a fine is drawn in a list: who, what for, how much. A tap
 * opens the fine, or the challenge it came from, with everything known about it, and
 * "Slet" for whoever may (`FineDetails`). The sheet is fetched when it is opened: drawn
 * beforehand for every row, it was most of the fine box's page, and nearly never looked at.
 */
export function FineRow({ fine }: { fine: HistoryFine }) {
  return (
    <li>
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
                {fine.player.name} <span className="font-normal text-slate-500">· {fine.reason}</span>
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

/** Fines as rows, newest first. */
export function FineHistory({ fines }: { fines: HistoryFine[] }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-slate-100">
        {fines.map((fine) => (
          <FineRow key={fine.id} fine={fine} />
        ))}
      </ul>
    </Card>
  );
}
