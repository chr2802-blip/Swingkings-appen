import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, matchOptions } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { relativeDay } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { FinesTabs } from "@/components/fines-tabs";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { PaymentDialog } from "@/components/payment-dialog";
import { ActionButton } from "@/components/action-button";
import { deleteFine } from "@/app/actions/fines";

export default async function FinesPage() {
  const user = await requireTeamUser();
  const manages = canManageFines(user, user.teamId);
  const db = teamDb(user.teamId);
  const [board, recent, matches] = await Promise.all([
    fineBoard(user.teamId),
    db.fine.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        reason: true,
        units: true,
        unitPriceKr: true,
        createdAt: true,
        challengeId: true,
        player: { select: { id: true, name: true, photoId: true } },
      },
    }),
    manages ? matchOptions(user.teamId) : Promise.resolve([]),
  ]);

  const totals = board.balances.reduce(
    (sum, row) => ({
      fined: sum.fined + row.finedKr,
      paid: sum.paid + row.paidKr,
      owed: sum.owed + Math.max(0, row.owesKr),
    }),
    { fined: 0, paid: 0, owed: 0 },
  );
  const mine = board.balances.find((row) => row.userId === user.id);

  return (
    <div>
      <PageHeader
        title="Bødekassen"
        description={`1 bøde = ${kr(board.finePriceKr)}`}
        action={
          manages && (
            <>
              <PaymentDialog members={board.roster} />
              <GiveFineDialog
                members={board.roster}
                fineTypes={board.fineTypes}
                finePriceKr={board.finePriceKr}
                matches={matches}
              />
            </>
          )
        }
      />
      <FinesTabs current="/boder" />

      <div className="mb-8 grid grid-cols-3 gap-3">
        <Stat label="I kassen" value={kr(totals.paid)} />
        <Stat label="Udestående" value={kr(totals.owed)} tone={totals.owed > 0 ? "red" : undefined} />
        <Stat label="Bøder i alt" value={kr(totals.fined)} />
      </div>

      {mine && (
        <Card className="mb-8">
          <SectionTitle>Din konto</SectionTitle>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={`text-3xl font-semibold ${mine.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>
                {mine.owesKr > 0 ? kr(mine.owesKr) : mine.owesKr < 0 ? `+${kr(-mine.owesKr)}` : "0 kr"}
              </p>
              <p className="text-sm text-slate-500">
                {mine.owesKr > 0 ? "skylder du til kassen" : mine.owesKr < 0 ? "til gode" : "Du skylder ingenting 🙌"}
              </p>
            </div>
            <Link href={`/boder/spiller/${user.id}`} className="text-sm font-medium text-[var(--accent-text)] underline">
              Se dine bøder
            </Link>
          </div>
        </Card>
      )}

      <section className="mb-8">
        <SectionTitle>Bødetavlen</SectionTitle>
        <Card padded={false}>
          <ol className="divide-y divide-slate-100">
            {board.balances.map((row, index) => {
              const person = board.people.get(row.userId);
              if (!person) return null;
              return (
                <li key={row.userId}>
                  <Link
                    href={`/boder/spiller/${row.userId}`}
                    className="press-card flex items-center gap-3 px-4 py-3"
                  >
                    <span className="w-5 text-right text-sm text-slate-400">{index + 1}</span>
                    <Avatar name={person.name} photoId={person.photoId} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {person.name} {!person.onTeam && <span className="text-xs text-slate-400">(ikke på holdet)</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {row.fines === 1 ? "1 bøde" : `${row.fines} bøder`} · {kr(row.finedKr)} i alt
                      </span>
                    </span>
                    {row.owesKr > 0 ? (
                      <Badge tone="red">skylder {kr(row.owesKr)}</Badge>
                    ) : row.finedKr > 0 ? (
                      <Badge tone="green">betalt</Badge>
                    ) : (
                      <Badge>ren tavle</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      </section>

      <section>
        <SectionTitle>Seneste bøder</SectionTitle>
        {recent.length === 0 ? (
          <EmptyState icon="😇">Ingen bøder endnu. Det varer nok ikke længe.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {recent.map((fine) => (
                <li key={fine.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={fine.player.name} photoId={fine.player.photoId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {fine.player.name} <span className="font-normal text-slate-500">· {fine.reason}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {fineUnits(fine.units)} · {kr(fineAmount(fine))} · {relativeDay(fine.createdAt)}
                      {fine.challengeId && " · ⚔️ udfordring"}
                    </p>
                  </div>
                  {manages && (
                    <ActionButton
                      action={deleteFine}
                      fields={{ id: fine.id }}
                      label="Slet"
                      variant="ghost"
                      confirm={`Slet bøden til ${fine.player.name}?`}
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <Card className="px-3 py-3 text-center sm:px-5">
      <p className={`text-lg font-semibold sm:text-2xl ${tone === "red" ? "text-red-600" : ""}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </Card>
  );
}
