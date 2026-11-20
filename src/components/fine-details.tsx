import type { TeamUser } from "@/lib/auth";
import { canDeleteFine } from "@/lib/access";
import type { fineDetails } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { DELETED_USER } from "@/lib/names";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { DetailRows, challengeRows, type DetailRow } from "@/components/challenge-details";
import { deleteFine } from "@/app/actions/fines";

/** Everything known about one fine, and "Slet" for whoever may — the sheet behind every fine row. */
export type FineInFull = NonNullable<Awaited<ReturnType<typeof fineDetails>>>;

export function FineDetails({ fine, user }: { fine: FineInFull; user: TeamUser }) {
  const amount = fineAmount(fine);
  const when = readInZone(fine.createdAt, "EEEE d. MMMM yyyy 'kl.' HH:mm");
  // A challenge's fine is told by the challenge: what it was, who won, the stake, who
  // approved it — in the same rows as any fine's, so it all stands in one place.
  const rows: DetailRow[] = fine.challenge
    ? [...challengeRows(fine.challenge, fine.unitPriceKr), ["Hvornår", when]]
    : [
        ["For", fine.reason],
        ["Antal", fineUnits(fine.units)],
        ["Pris pr. bøde", kr(fine.unitPriceKr)],
        // Null once the giver deleted their account; the fine stands without them.
        ["Givet af", fine.issuedBy ? <PlayerLink key="giver" userId={fine.issuedBy.id}>{fine.issuedBy.name}</PlayerLink> : DELETED_USER],
        ["Hvornår", when],
      ];
  if (!fine.challenge && fine.match) rows.push(["Aktivitet", `${fine.match.opponent ?? fine.match.title} · ${readInZone(fine.match.startsAt, "d. MMM yyyy")}`]);
  if (fine.note) rows.push(["Note", fine.note]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PlayerLink userId={fine.player.id} press="icon" className="block shrink-0" aria-label={fine.player.name}>
          <Avatar name={fine.player.name} photoId={fine.player.photoId} size="lg" />
        </PlayerLink>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">
            <PlayerLink userId={fine.player.id} className="max-w-full truncate align-top">{fine.player.name}</PlayerLink>
          </p>
          <p className={`text-2xl font-semibold ${amount < 0 ? "text-emerald-700" : "text-red-600"}`}>{kr(amount)}</p>
        </div>
      </div>

      <DetailRows rows={rows} />

      {/* At the foot, as on every detail sheet. */}
      {canDeleteFine(user, user.teamId, fine) && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <ActionButton
            action={deleteFine}
            fields={{ id: fine.id }}
            label="Slet bøden"
            variant="danger"
            confirm={
              fine.challengeId
                ? "Slet bøden? Hele udfordringen bliver slettet, også vinderens del."
                : `Slet bøden til ${fine.player.name}?`
            }
            confirmLabel="Slet bøden"
          />
        </div>
      )}
    </div>
  );
}
