import { notFound } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, matchOptions } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { PaymentDialog } from "@/components/payment-dialog";
import { ActionButton } from "@/components/action-button";
import { deleteFine, deletePayment } from "@/app/actions/fines";

export default async function PlayerFinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeamUser();
  const manages = canManageFines(user, user.teamId);
  const db = teamDb(user.teamId);
  const board = await fineBoard(user.teamId);
  const person = board.people.get(id);
  if (!person) notFound();
  const account = board.balances.find((row) => row.userId === id)!;

  const [fines, payments, matches] = await Promise.all([
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
        issuedBy: { select: { name: true } },
        match: { select: { opponent: true, title: true } },
      },
    }),
    db.payment.findMany({
      where: { playerId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, amountKr: true, note: true, createdAt: true, recordedBy: { select: { name: true } } },
    }),
    manages ? matchOptions(user.teamId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title={person.name}
        action={
          manages && (
            <>
              <PaymentDialog members={board.roster} defaultPlayerId={id} defaultAmount={account.owesKr} />
              {person.onTeam && (
                <GiveFineDialog
                  members={board.roster}
                  fineTypes={board.fineTypes}
                  finePriceKr={board.finePriceKr}
                  matches={matches}
                  defaultPlayerId={id}
                />
              )}
            </>
          )
        }
      />

      <Card className="mb-8 flex items-center gap-4">
        <Avatar name={person.name} photoId={person.photoId} size="lg" />
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold">{kr(account.finedKr)}</p>
            <p className="text-xs text-slate-500">bøder</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{kr(account.paidKr)}</p>
            <p className="text-xs text-slate-500">betalt</p>
          </div>
          <div>
            <p className={`text-lg font-semibold ${account.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>
              {kr(Math.max(0, account.owesKr))}
            </p>
            <p className="text-xs text-slate-500">skylder</p>
          </div>
        </div>
      </Card>

      <section className="mb-8">
        <SectionTitle>Bøder</SectionTitle>
        {fines.length === 0 ? (
          <EmptyState icon="😇">Ingen bøder. Mønsterspiller!</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {fines.map((fine) => (
                <li key={fine.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{fine.reason}</p>
                    <p className="text-xs text-slate-500">
                      {fineUnits(fine.units)} · {kr(fineAmount(fine))} · {readInZone(fine.createdAt, "d. MMM yyyy")} · givet af{" "}
                      {fine.issuedBy.name}
                      {fine.match && ` · ${fine.match.opponent ?? fine.match.title}`}
                    </p>
                    {fine.note && <p className="mt-1 text-xs text-slate-600">{fine.note}</p>}
                  </div>
                  {manages && (
                    <ActionButton
                      action={deleteFine}
                      fields={{ id: fine.id }}
                      label="Slet"
                      variant="ghost"
                      confirm="Slet bøden?"
                      confirmLabel="Slet bøden"
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Betalinger</SectionTitle>
        {payments.length === 0 ? (
          <EmptyState>Ingen betalinger registreret.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-emerald-700">+ {kr(payment.amountKr)}</p>
                    <p className="text-xs text-slate-500">
                      {readInZone(payment.createdAt, "d. MMM yyyy")} · registreret af {payment.recordedBy.name}
                      {payment.note && ` · ${payment.note}`}
                    </p>
                  </div>
                  {manages && (
                    <ActionButton
                      action={deletePayment}
                      fields={{ id: payment.id }}
                      label="Slet"
                      variant="ghost"
                      confirm="Slet betalingen?"
                      confirmLabel="Slet betalingen"
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
