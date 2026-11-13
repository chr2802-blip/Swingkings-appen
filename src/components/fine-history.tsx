import type { TeamUser } from "@/lib/auth";
import { canDeleteFine, canManageFines } from "@/lib/access";
import type { fineHistory } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { readInZone, relativeDay } from "@/lib/time";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { ActionButton } from "@/components/action-button";
import { ChallengeCard } from "@/components/challenge-card";
import { DetailSheet } from "@/components/detail-sheet";
import { deleteFine } from "@/app/actions/fines";
import { Star } from "@/components/crest";

type HistoryFine = Awaited<ReturnType<typeof fineHistory>>[number];

/**
 * Fines as rows, newest first: who, what for, how much. A tap opens the fine — or the
 * challenge it came from — with everything known about it, and "Slet" for whoever may.
 */
export function FineHistory({ fines, user }: { fines: HistoryFine[]; user: TeamUser }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-slate-100">
        {fines.map((fine) => (
          <li key={fine.id}>
            <DetailSheet
              title={fine.challenge ? "Udfordring" : "Bøde"}
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
                      {fine.clearedAt && " · nulstillet"}
                    </span>
                  </span>
                  <span aria-hidden className="text-slate-300">
                    ›
                  </span>
                </>
              }
            >
              <FineDetails fine={fine} user={user} />
            </DetailSheet>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FineDetails({ fine, user }: { fine: HistoryFine; user: TeamUser }) {
  const amount = fineAmount(fine);
  const rows: [string, React.ReactNode][] = [
    ["For", fine.reason],
    ["Antal", fineUnits(fine.units)],
    ["Pris pr. bøde", kr(fine.unitPriceKr)],
    ["Givet af", fine.issuedBy.name],
    ["Hvornår", readInZone(fine.createdAt, "EEEE d. MMMM yyyy 'kl.' HH:mm")],
  ];
  if (fine.match) rows.push(["Aktivitet", `${fine.match.opponent ?? fine.match.title} · ${readInZone(fine.match.startsAt, "d. MMM yyyy")}`]);
  if (fine.note) rows.push(["Note", fine.note]);
  rows.push([
    "Status",
    fine.clearedAt ? `Nulstillet ${readInZone(fine.clearedAt, "d. MMM yyyy")}` : amount < 0 ? "Trækkes fra" : "Udestående",
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar name={fine.player.name} photoId={fine.player.photoId} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{fine.player.name}</p>
          <p className={`text-2xl font-semibold ${fine.clearedAt ? "text-slate-400 line-through" : amount < 0 ? "text-emerald-700" : "text-red-600"}`}>
            {kr(amount)}
          </p>
        </div>
        {fine.clearedAt && <Badge>nulstillet</Badge>}
      </div>

      <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 px-4 py-2.5 text-sm">
            <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
            <dd className="min-w-0 flex-1 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {fine.challenge && (
        <section>
          <SectionTitle>Udfordringen</SectionTitle>
          <ChallengeCard
            challenge={fine.challenge}
            viewerId={user.id}
            managesFines={canManageFines(user, user.teamId)}
            finePriceKr={fine.unitPriceKr}
          />
        </section>
      )}

      {canDeleteFine(user, user.teamId, fine) && (
        <ActionButton
          action={deleteFine}
          fields={{ id: fine.id }}
          label="Slet bøden"
          variant="danger"
          confirm={
            fine.challengeId
              ? "Slet bøden? Hele udfordringen bliver trukket tilbage, også vinderens del."
              : `Slet bøden til ${fine.player.name}?`
          }
          confirmLabel="Slet bøden"
        />
      )}
    </div>
  );
}
