import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { fineBoard, fineHistory, matchOptions, monthKings } from "@/lib/fine-data";
import { fineUnits, kr } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { FinesTabs } from "@/components/fines-tabs";
import { FineHistory } from "@/components/fine-history";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ActionButton } from "@/components/action-button";
import { resetFines } from "@/app/actions/fines";
import { Crown } from "@/components/crest";

/** How many fines the front page shows; the rest are on /boder/historik. */
const RECENT = 5;

export default async function FinesPage() {
  const user = await requireTeamUser();
  // One more than shown, so the page knows whether there is a history worth linking to.
  const [board, kings, recent, matches] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    fineHistory(user.teamId, RECENT + 1),
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

      {/* The two numbers people come for, side by side, so the board starts on the first screen. */}
      <Card padded={false} className="mb-6 overflow-hidden">
        <div className={`grid divide-x divide-slate-100 ${mine ? "grid-cols-2" : ""}`}>
          {mine && (
            <Link href={`/boder/spiller/${user.id}`} className="press-card px-4 py-3">
              <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Du skylder</p>
              <p className={`text-3xl font-semibold ${mine.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(mine.owesKr)}</p>
              <p className="text-xs text-slate-500">
                {mine.units > 0 ? `${fineUnits(mine.units)} · se dem ›` : "Ren tavle 🙌"}
              </p>
            </Link>
          )}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">I kassen</p>
            <p className="text-3xl font-semibold">{kr(totals.fined)}</p>
            <p className="text-xs text-slate-500">{kr(totals.owed)} udestående</p>
          </div>
        </div>
        {mine && mine.units > 0 && (
          <Link
            href="/boder/udfordringer"
            className="press-card block border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-[var(--accent-text)]"
          >
            ⚔️ Udfordr dig ud af dem ›
          </Link>
        )}
      </Card>

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
                    className={`press-card flex items-center gap-3 px-4 py-2.5 ${
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
          <>
            <FineHistory fines={recent.slice(0, RECENT)} user={user} />
            {recent.length > RECENT && (
              <p className="mt-3 text-center">
                <Link href="/boder/historik" className="text-sm font-medium text-[var(--accent-text)] underline">
                  Se hele historikken
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
