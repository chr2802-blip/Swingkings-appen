import type { TeamUser } from "@/lib/auth";
import { canDeleteFine, canManageFines } from "@/lib/access";
import type { HistoryFine } from "@/components/fine-history";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { DELETED_USER } from "@/lib/names";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { ChallengeCard } from "@/components/challenge-card";
import { deleteFine } from "@/app/actions/fines";

/** Everything known about one fine, and "Slet" for whoever may — the sheet behind every fine row. */
export function FineDetails({ fine, user }: { fine: HistoryFine; user: TeamUser }) {
  const amount = fineAmount(fine);
  const when = readInZone(fine.createdAt, "EEEE d. MMMM yyyy 'kl.' HH:mm");
  // A challenge's fine is told by the challenge: what it was, the stake, who approved it.
  // Only what the card does not say is added to it, so it all stands in one place.
  const rows: [string, React.ReactNode][] = fine.challenge
    ? [["Hvornår", when]]
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
        <PlayerLink userId={fine.player.id} className="shrink-0" aria-label={fine.player.name}>
          <Avatar name={fine.player.name} photoId={fine.player.photoId} size="lg" />
        </PlayerLink>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">
            <PlayerLink userId={fine.player.id}>{fine.player.name}</PlayerLink>
          </p>
          <p className={`text-2xl font-semibold ${amount < 0 ? "text-emerald-700" : "text-red-600"}`}>{kr(amount)}</p>
        </div>
      </div>

      {fine.challenge ? (
        <ChallengeCard
          challenge={fine.challenge}
          viewerId={user.id}
          managesFines={canManageFines(user, user.teamId)}
          finePriceKr={fine.unitPriceKr}
        >
          <dl className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-3 py-2">
                <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
                <dd className="min-w-0 flex-1 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </ChallengeCard>
      ) : (
        <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-3 px-4 py-2.5 text-sm">
              <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
              <dd className="min-w-0 flex-1 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {canDeleteFine(user, user.teamId, fine) && (
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
      )}
    </div>
  );
}
