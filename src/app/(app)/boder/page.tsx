import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { canDeleteFine, canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, matchOptions, monthKings } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { relativeDay } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { FinesTabs } from "@/components/fines-tabs";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ActionButton } from "@/components/action-button";
import { deleteFine, resetFines } from "@/app/actions/fines";
import { Crown, Star } from "@/components/crest";

export default async function FinesPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const [board, kings, recent, matches] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
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
        clearedAt: true,
        issuedById: true,
        player: { select: { id: true, name: true, photoId: true } },
      },
    }),
    matchOptions(user.teamId),
  ]);

  const totals = board.balances.reduce(
    (sum, row) => ({ fined: sum.fined + row.finedKr, owed: sum.owed + row.owesKr }),
    { fined: 0, owed: 0 },
  );
  const mine = board.balances.find((row) => row.userId === user.id);
  const manages = canManageFines(user, user.teamId);

  return (
    <div>
      <PageHeader
        title="Bødekassen"
        description={`1 bøde = ${kr(board.finePriceKr)}`}
        action={
          <GiveFineDialog
            members={board.roster}
            fineTypes={board.fineTypes}
            finePriceKr={board.finePriceKr}
            matches={matches}
          />
        }
      />
      <FinesTabs current="/boder" />

      <div className="mb-8 grid grid-cols-2 gap-3">
        <Stat label="Udestående" value={kr(totals.owed)} tone={totals.owed > 0 ? "red" : undefined} />
        <Stat label="Bøder i alt" value={kr(totals.fined)} />
      </div>

      {mine && (
        <Card className="mb-8">
          <SectionTitle>Din konto</SectionTitle>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={`text-3xl font-semibold ${mine.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(mine.owesKr)}</p>
              <p className="text-sm text-slate-500">
                {mine.units > 0 ? `${fineUnits(mine.units)} udestående` : "Ren tavle 🙌"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-sm font-medium text-[var(--accent-text)]">
              <Link href={`/boder/spiller/${user.id}`} className="underline">
                Se dine bøder
              </Link>
              {mine.units > 0 && (
                <Link href="/boder/udfordringer" className="underline">
                  Udfordr dig ud af dem
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}

      <section className="mb-8">
        <SectionTitle
          action={
            manages &&
            totals.owed > 0 && (
              <ActionButton
                action={resetFines}
                fields={{ playerId: "alle" }}
                label="Nulstil alle"
                variant="ghost"
                confirm="Nulstil hele holdets bøder? Historikken bliver, men ingen har udestående bagefter."
                confirmLabel="Nulstil alle"
              />
            )
          }
        >
          Bødetavlen
        </SectionTitle>
        <Card padded={false}>
          <ol className="divide-y divide-slate-100">
            {board.balances.map((row, index) => {
              const person = board.people.get(row.userId);
              if (!person) return null;
              const isMe = row.userId === user.id;
              return (
                <li key={row.userId}>
                  <Link
                    href={`/boder/spiller/${row.userId}`}
                    aria-current={isMe ? "true" : undefined}
                    className={`press-card flex items-center gap-3 px-4 py-3 ${
                      isMe ? "border-l-4 border-[var(--gold)] bg-[var(--gold-tint)] pl-3" : ""
                    }`}
                  >
                    <span className="w-5 text-right text-sm text-slate-400">{index + 1}</span>
                    <Avatar name={person.name} photoId={person.photoId} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{person.name}</span>
                        {kings.userIds.includes(row.userId) && (
                          <span title="Månedens bødekonge" className="flex items-center">
                            <Crown className="h-4 w-4" />
                            <span className="sr-only">(månedens bødekonge)</span>
                          </span>
                        )}
                        {isMe && <span className="text-xs font-normal text-slate-500">(dig)</span>}
                        {!person.onTeam && <span className="text-xs font-normal text-slate-400">(ikke på holdet)</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {fineUnits(row.units)} udestående · {kr(row.finedKr)} i alt
                      </span>
                    </span>
                    {row.owesKr > 0 ? <Badge tone="red">{kr(row.owesKr)}</Badge> : <Badge tone="green">ren tavle</Badge>}
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
