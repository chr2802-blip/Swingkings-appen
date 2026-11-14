import Link from "next/link";
import type { TeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, fineHistory, matchOptions, monthKings } from "@/lib/fine-data";
import { waitsOn } from "@/lib/challenges";
import { fineUnits, kr } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { playerHref } from "@/components/player-link";
import { SwipePages } from "@/components/swipe-pages";
import { FineHistory } from "@/components/fine-history";
import { FineCreateMenu } from "@/components/fine-create-menu";
import { ChallengeCard, challengeCardInclude } from "@/components/challenge-card";
import { DetailSheet } from "@/components/detail-sheet";
import { FineTypeDialog } from "@/components/fine-type-dialog";
import { ActionButton } from "@/components/action-button";
import { resetFines } from "@/app/actions/fines";
import { Crown } from "@/components/crest";
import { PayLink } from "@/components/pay-link";

/** How far back the history page goes. A team gives a few fines a week, so this is a year or two. */
const HISTORY = 100;

/** The pages under the overview, in the order they are swiped through. */
export const FINE_PAGES = ["/boder", "/boder/historik", "/boder/katalog"] as const;

/** `/boder?udfordringer` opens the fine box with the challenges' sheet open (a notification's link). */
export const CHALLENGES_PARAM = "udfordringer";

type Board = Awaited<ReturnType<typeof fineBoard>>;

/**
 * The fine box: the overview stays put at the top — what you owe, what is in the box, and
 * the challenges — and under it the board, the history and the catalogue are swiped
 * between. Each has its own address (`show`), and all three are read at once, so a swipe
 * never waits on the server. Challenges have no page of their own: while any wait for
 * approval the overview says how many, and a tap opens them in a sheet (`openChallenges`
 * on arrival). With none waiting the overview says nothing of them; settled ones are in
 * the history, with the fines they moved.
 */
export async function FinesScreen({
  user,
  show,
  openChallenges = false,
}: {
  user: TeamUser;
  show: (typeof FINE_PAGES)[number];
  openChallenges?: boolean;
}) {
  const db = teamDb(user.teamId);
  const [board, kings, history, matches, pending] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    fineHistory(user.teamId, HISTORY),
    matchOptions(user.teamId),
    db.challenge.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, include: challengeCardInclude }),
  ]);
  const manages = canManageFines(user, user.teamId);
  const totals = board.balances.reduce(
    (sum, row) => ({ fined: sum.fined + row.finedKr, owed: sum.owed + row.owesKr }),
    { fined: 0, owed: 0 },
  );
  const mine = board.balances.find((row) => row.userId === user.id);
  // What is waiting on the viewer goes first: it is the reason they opened the sheet.
  const waiting = pending.filter((c) => waitsOn(c, user.id));
  const others = pending.filter((c) => !waiting.includes(c));
  const card = (c: (typeof pending)[number]) => (
    <ChallengeCard key={c.id} challenge={c} viewerId={user.id} managesFines={manages} finePriceKr={board.finePriceKr} />
  );

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
            <Link href={playerHref(user.id)} className="press-card px-4 py-3">
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
        {mine && mine.owesKr > 0 && board.payLink && (
          <PayLink
            kind="fines"
            link={board.payLink}
            amountKr={mine.owesKr}
            name={user.name}
            className="press-card flex w-full items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-left text-sm"
          >
            <span className="font-medium">💸 Betal dine bøder</span>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {kr(mine.owesKr)} med MobilePay
              <span aria-hidden>›</span>
            </span>
          </PayLink>
        )}
        <DetailSheet
          title="Udfordringer"
          // Gone when none wait — but a sheet already open stays, so approving the last one
          // in it does not snatch it away.
          hidden={pending.length === 0}
          initialOpen={openChallenges}
          clearParam={CHALLENGES_PARAM}
          triggerClassName="press-card flex w-full items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-left text-sm"
          trigger={
            <>
              <span className="font-medium">⚔️ Udfordringer</span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {pending.length} venter på godkendelse
                {waiting.length > 0 && <Badge tone="amber">{waiting.length} på dig</Badge>}
                <span aria-hidden>›</span>
              </span>
            </>
          }
        >
          <p className="mb-6 text-sm text-slate-500">
            Meld resultatet under +, en anden godkender, og taberen overtager indsatsen. Afgjorte udfordringer står i historikken.
          </p>
          {waiting.length > 0 && (
            <section className="mb-8">
              <SectionTitle>Venter på din godkendelse</SectionTitle>
              <div className="space-y-3">{waiting.map(card)}</div>
            </section>
          )}
          {others.length > 0 && (
            <section className="mb-8">
              <SectionTitle>Venter på en anden</SectionTitle>
              <div className="space-y-3">{others.map(card)}</div>
            </section>
          )}
          {pending.length === 0 && <EmptyState icon="⚔️">Ingen udfordringer venter. Hvem tør?</EmptyState>}
        </DetailSheet>
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
                href={playerHref(row.userId)}
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
                <span aria-hidden className="text-slate-300">
                  ›
                </span>
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
      {types.length === 0 && (
        <EmptyState icon="📜">
          {manages ? "Kataloget er tomt. Opret holdets bøder, så er de klar, når der skal deles ud." : "Kataloget er tomt endnu."}
        </EmptyState>
      )}
      {(types.length > 0 || manages) && (
        <Card padded={false} className={`overflow-hidden ${types.length === 0 ? "mt-3" : ""}`}>
          <ul className="divide-y divide-slate-100">
            {types.map((type) => {
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{type.name}</span>
                    {type.description && <span className="block text-xs text-slate-500">{type.description}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold">{fineUnits(type.units)}</span>
                    <span className="block text-xs text-slate-500">{kr(type.units * board.finePriceKr)}</span>
                  </span>
                </>
              );
              // Only who manages the fines can open one: the row is then the button, as in the history.
              return (
                <li key={type.id}>
                  {manages ? (
                    <FineTypeDialog finePriceKr={board.finePriceKr} fineType={type}>
                      {row}
                    </FineTypeDialog>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                  )}
                </li>
              );
            })}
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
