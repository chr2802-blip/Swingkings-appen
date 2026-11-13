import Link from "next/link";
import type { TeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, fineHistory, matchOptions, monthKings } from "@/lib/fine-data";
import { waitsOn } from "@/lib/challenges";
import { fineUnits, kr } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { SwipePages } from "@/components/swipe-pages";
import { FineHistory } from "@/components/fine-history";
import { FineCreateMenu } from "@/components/fine-create-menu";
import { FineTypeDialog } from "@/components/fine-type-dialog";
import { ActionButton } from "@/components/action-button";
import { ActionMenu } from "@/components/action-menu";
import { removeFineType, resetFines } from "@/app/actions/fines";
import { Crown } from "@/components/crest";

/** How far back the history page goes. A team gives a few fines a week, so this is a year or two. */
const HISTORY = 100;

/** The pages under the overview, in the order they are swiped through. */
export const FINE_PAGES = ["/boder", "/boder/historik", "/boder/katalog"] as const;

type Board = Awaited<ReturnType<typeof fineBoard>>;

/**
 * The fine box: the overview stays put at the top — what you owe, what is in the box, and
 * the way to the challenges — and under it the board, the history and the catalogue are
 * swiped between. Each has its own address (`show`), and all three are read at once, so
 * a swipe never waits on the server.
 */
export async function FinesScreen({ user, show }: { user: TeamUser; show: (typeof FINE_PAGES)[number] }) {
  const [board, kings, history, matches, pending] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    fineHistory(user.teamId, HISTORY),
    matchOptions(user.teamId),
    teamDb(user.teamId).challenge.findMany({ where: { status: "PENDING" } }),
  ]);
  const manages = canManageFines(user, user.teamId);
  const totals = board.balances.reduce(
    (sum, row) => ({ fined: sum.fined + row.finedKr, owed: sum.owed + row.owesKr }),
    { fined: 0, owed: 0 },
  );
  const mine = board.balances.find((row) => row.userId === user.id);
  const waiting = pending.filter((c) => waitsOn(c, user.id)).length;

  return (
    <div>
      <PageHeader title="Bødekassen" />
      <FineCreateMenu
        viewerId={user.id}
        members={board.roster}
        fineTypes={board.fineTypes}
        finePriceKr={board.finePriceKr}
        matches={matches}
      />

      <Card padded={false} className="mb-5 overflow-hidden">
        <div className={`grid divide-x divide-slate-100 ${mine ? "grid-cols-2" : ""}`}>
          {mine && (
            <Link href={`/boder/spiller/${user.id}`} className="press-card px-4 py-3">
              <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Du skylder</p>
              <p className={`text-3xl font-semibold ${mine.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(mine.owesKr)}</p>
              <p className="text-xs text-slate-500">{mine.units > 0 ? `${fineUnits(mine.units)} · se dem ›` : "Ren tavle 🙌"}</p>
            </Link>
          )}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">I kassen</p>
            <p className="text-3xl font-semibold">{kr(totals.fined)}</p>
            <p className="text-xs text-slate-500">{kr(totals.owed)} udestående</p>
          </div>
        </div>
        <Link
          href="/boder/udfordringer"
          className="press-card flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-sm"
        >
          <span className="font-medium">⚔️ Udfordringer</span>
          {waiting > 0 ? (
            <Badge tone="amber">{waiting} venter på dig</Badge>
          ) : (
            <span className="text-xs text-slate-500">
              {pending.length > 0 ? `${pending.length} venter på godkendelse ›` : mine && mine.units > 0 ? "Udfordr dig ud af dine bøder ›" : "Se dem ›"}
            </span>
          )}
        </Link>
      </Card>

      <SwipePages
        initial={FINE_PAGES.indexOf(show)}
        pages={[
          {
            href: "/boder",
            title: "Bødetavlen",
            action: manages && totals.owed > 0 && (
              <ActionButton
                action={resetFines}
                fields={{ playerId: "alle" }}
                label="Nulstil alle"
                variant="ghost"
                confirm="Nulstil hele holdets bøder? Historikken bliver, men ingen har udestående bagefter."
                confirmLabel="Nulstil alle"
              />
            ),
            children: <BoardPage userId={user.id} board={board} kings={kings.userIds} />,
          },
          {
            href: "/boder/historik",
            title: "Historik",
            children:
              history.length === 0 ? (
                <EmptyState icon="😇">Ingen bøder endnu. Det varer nok ikke længe.</EmptyState>
              ) : (
                <FineHistory fines={history} user={user} />
              ),
          },
          {
            href: "/boder/katalog",
            title: "Katalog",
            children: <CataloguePage board={board} manages={manages} />,
          },
        ]}
      />
    </div>
  );
}

function BoardPage({ userId, board, kings }: { userId: string; board: Board; kings: string[] }) {
  return (
    <Card padded={false}>
      <ol className="divide-y divide-slate-100">
        {board.balances.map((row, index) => {
          const person = board.people.get(row.userId);
          if (!person) return null;
          const isMe = row.userId === userId;
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
                <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                  <span className="truncate">{person.name}</span>
                  {kings.includes(row.userId) && (
                    <span title="Månedens bødekonge" className="flex items-center">
                      <Crown className="h-4 w-4" />
                      <span className="sr-only">(månedens bødekonge)</span>
                    </span>
                  )}
                  {isMe && <span className="text-xs font-normal text-slate-500">(dig)</span>}
                  {!person.onTeam && <span className="text-xs font-normal text-slate-400">(ikke på holdet)</span>}
                </span>
                {row.owesKr > 0 ? <Badge tone="red">{kr(row.owesKr)}</Badge> : <Badge tone="green">ren tavle</Badge>}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function CataloguePage({ board, manages }: { board: Board; manages: boolean }) {
  const types = board.fineTypes;
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">Hvad koster hvad. 1 bøde = {kr(board.finePriceKr)}.</p>
      {types.length === 0 && (
        <EmptyState icon="📜">
          {manages ? "Kataloget er tomt. Opret holdets bøder, så er de klar, når der skal deles ud." : "Kataloget er tomt endnu."}
        </EmptyState>
      )}
      {(types.length > 0 || manages) && (
        <Card padded={false} className={`overflow-hidden ${types.length === 0 ? "mt-3" : ""}`}>
          <ul className="divide-y divide-slate-100">
            {types.map((type) => (
              <li key={type.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{type.name}</p>
                  {type.description && <p className="text-xs text-slate-500">{type.description}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{fineUnits(type.units)}</p>
                  <p className="text-xs text-slate-500">{kr(type.units * board.finePriceKr)}</p>
                </div>
                {manages && (
                  <ActionMenu icon label={`Handlinger for ${type.name}`} title={type.name}>
                    <FineTypeDialog finePriceKr={board.finePriceKr} fineType={type} />
                    <ActionButton
                      action={removeFineType}
                      fields={{ id: type.id }}
                      label="Fjern fra kataloget"
                      variant="danger"
                      confirm={`Fjern “${type.name}” fra kataloget?`}
                      confirmLabel="Fjern"
                    />
                  </ActionMenu>
                )}
              </li>
            ))}
            {/* Making a new one is the list's last row, where the new one will land. */}
            {manages && (
              <li>
                <FineTypeDialog finePriceKr={board.finePriceKr} />
              </li>
            )}
          </ul>
        </Card>
      )}
    </>
  );
}
