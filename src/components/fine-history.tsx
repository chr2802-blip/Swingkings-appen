import type { TeamUser } from "@/lib/auth";
import { canDeleteFine } from "@/lib/access";
import type { fineHistory } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { relativeDay } from "@/lib/time";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { ActionButton } from "@/components/action-button";
import { deleteFine } from "@/app/actions/fines";
import { Star } from "@/components/crest";

/** Fines as rows, newest first: who, what for, how much, and "Slet" for whoever may. */
export function FineHistory({
  fines,
  user,
}: {
  fines: Awaited<ReturnType<typeof fineHistory>>;
  user: TeamUser;
}) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-slate-100">
        {fines.map((fine) => (
          <li key={fine.id} className="flex items-center gap-3 px-4 py-3">
            <Star className="h-3.5 w-3.5" />
            <Avatar name={fine.player.name} photoId={fine.player.photoId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {fine.player.name} <span className="font-normal text-slate-500">· {fine.reason}</span>
              </p>
              <p className="text-xs text-slate-500">
                {fineUnits(fine.units)} · {kr(fineAmount(fine))} · {relativeDay(fine.createdAt)}
                {fine.challengeId && " · ⚔️ udfordring"}
                {fine.clearedAt && " · nulstillet"}
              </p>
            </div>
            {canDeleteFine(user, user.teamId, fine) && (
              <ActionButton
                action={deleteFine}
                fields={{ id: fine.id }}
                label="Slet"
                variant="ghost"
                confirm={
                  fine.challengeId
                    ? "Slet bøden? Hele udfordringen bliver trukket tilbage, også vinderens del."
                    : `Slet bøden til ${fine.player.name}?`
                }
                confirmLabel="Slet bøden"
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
