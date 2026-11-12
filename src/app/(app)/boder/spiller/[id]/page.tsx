import { notFound } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canDeleteFine, canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, matchOptions } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ActionButton } from "@/components/action-button";
import { deleteFine, resetFines } from "@/app/actions/fines";

export default async function PlayerFinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const board = await fineBoard(user.teamId);
  const person = board.people.get(id);
  if (!person) notFound();
  const account = board.balances.find((row) => row.userId === id)!;

  const [fines, matches] = await Promise.all([
    db.fine.findMany({
      where: { playerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        note: true,
        units: true,
        unitPriceKr: true,
        createdAt: true,
        clearedAt: true,
        challengeId: true,
        issuedById: true,
        issuedBy: { select: { name: true } },
        match: { select: { opponent: true, title: true } },
      },
    }),
    matchOptions(user.teamId),
  ]);

  return (
    <div>
      <PageHeader
        title={person.name}
        action={
          person.onTeam && (
            <GiveFineDialog
              members={board.roster}
              fineTypes={board.fineTypes}
              finePriceKr={board.finePriceKr}
              matches={matches}
              defaultPlayerId={id}
            />
          )
        }
      />

      <Card className="mb-8 flex items-center gap-4">
        <Avatar name={person.name} photoId={person.photoId} size="lg" />
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          <div>
            <p className={`text-lg font-semibold ${account.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(account.owesKr)}</p>
            <p className="text-xs text-slate-500">udestående</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{account.units}</p>
            <p className="text-xs text-slate-500">{account.units === 1 ? "bøde" : "bøder"}</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{kr(account.finedKr)}</p>
            <p className="text-xs text-slate-500">i alt</p>
          </div>
        </div>
      </Card>
      {canManageFines(user, user.teamId) && fines.some((fine) => !fine.clearedAt) && (
        <div className="-mt-5 mb-8 flex justify-end">
          <ActionButton
            action={resetFines}
            fields={{ playerId: id }}
            label="Nulstil bøder"
            confirm={`Nulstil ${person.name}s bøder? Historikken bliver, men der er intet udestående bagefter.`}
            confirmLabel="Nulstil"
          />
        </div>
      )}

      <section>
        <SectionTitle>Bøder</SectionTitle>
        {fines.length === 0 ? (
          <EmptyState icon="😇">Ingen bøder. Mønsterspiller!</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {fines.map((fine) => (
                <li key={fine.id} className={`flex items-center gap-3 px-4 py-3 ${fine.clearedAt ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{fine.reason}</p>
                    <p className="text-xs text-slate-500">
                      {fineUnits(fine.units)} · {kr(fineAmount(fine))} · {readInZone(fine.createdAt, "d. MMM yyyy")} · givet af{" "}
                      {fine.issuedBy.name}
                      {fine.match && ` · ${fine.match.opponent ?? fine.match.title}`}
                      {fine.clearedAt && ` · nulstillet ${readInZone(fine.clearedAt, "d. MMM yyyy")}`}
                    </p>
                    {fine.note && <p className="mt-1 text-xs text-slate-600">{fine.note}</p>}
                  </div>
                  {canDeleteFine(user, user.teamId, fine) && (
                    <ActionButton
                      action={deleteFine}
                      fields={{ id: fine.id }}
                      label="Slet"
                      variant="ghost"
                      confirm={fine.challengeId ? "Slet bøden? Hele udfordringen bliver trukket tilbage, også den andens del." : "Slet bøden?"}
                      confirmLabel="Slet bøden"
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
