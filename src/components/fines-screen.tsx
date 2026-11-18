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
import { ChallengeDialog } from "@/components/challenge-dialog";
import { DetailSheet } from "@/components/detail-sheet";
import { FineTypeDialog } from "@/components/fine-type-dialog";
import { Crown } from "@/components/crest";
import { LiveRefresh } from "@/components/live-refresh";
import { FreshPulse } from "@/components/fresh";
import { FINES_CHANGED } from "@/lib/realtime-topic";

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
    fineHistory(user.teamId, { take: HISTORY }),
    matchOptions(user.teamId),
    db.challenge.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, include: challengeCardInclude }),
  ]);
  const manages = canManageFines(user, user.teamId);
  const paying = board.paymentOpenedAt !== null;
  const mine = board.balances.find((row) => row.userId === user.id);
  // What is waiting on the viewer goes first: it is the reason they opened the sheet.
  const waiting = pending.filter((c) => waitsOn(c, user.id));
  const others = pending.filter((c) => !waiting.includes(c));
  const card = (c: (typeof pending)[number]) => (
    <ChallengeCard key={c.id} challenge={c} viewerId={user.id} managesFines={manages} finePriceKr={board.finePriceKr} />
  );

  return (
    <div>
      <LiveRefresh events={[FINES_CHANGED]} />
      <FreshPulse />
      <PageHeader title="Bødekassen" />
      {/* While the box is open for payment what each player owes stands still: nothing to give. */}
      {!paying && (
        <FineCreateMenu
          viewerId={user.id}
          members={board.roster}
          fineTypes={board.fineTypes}
          finePriceKr={board.finePriceKr}
          matches={matches}
          managesFines={manages}
        />
      )}
      {paying && (
        <p role="status" className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          💸 <strong>Bødekassen er åben for betaling.</strong> Betal dine bøder på din egen side. Nye bøder og udfordringer
          venter til næste sæson.
        </p>
      )}

      <Card padded={false} className="mb-5 overflow-hidden">
        <div className={`grid divide-x divide-slate-100 ${mine ? "grid-cols-2" : ""}`}>
          {mine && (
            <Link href={playerHref(user.id)} className="press-card px-4 py-3">
              <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Dine bøder</p>
              {board.paid.has(user.id) ? (
                <>
                  <p className="font-score text-4xl font-semibold text-emerald-700">Betalt</p>
                  <p className="text-xs text-slate-500">{kr(mine.owesKr)} · tak! 🙌</p>
                </>
              ) : (
                <>
                  <p className={`font-score text-4xl font-semibold ${mine.owesKr > 0 ? "text-[var(--star)]" : "text-emerald-700"}`}>{kr(mine.owesKr)}</p>
                  <p className="text-xs text-slate-500">
                    {mine.owesKr === 0 ? "Ren tavle 🙌" : paying ? "Betal nu ›" : `${fineUnits(mine.units)} · se dem ›`}
                  </p>
                </>
              )}
            </Link>
          )}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">I kassen</p>
            <p className="font-score text-4xl font-semibold">{kr(board.totalKr)}</p>
            <p className="text-xs text-slate-500">
              {!paying ? "betales ved sæsonslut" : board.missingKr > 0 ? `${kr(board.missingKr)} mangler` : "alle har betalt"}
            </p>
          </div>
        </div>
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
          <p className="mb-4 text-sm text-slate-500">
            Meld resultatet her eller under +, en anden godkender, og taberen overtager indsatsen. Afgjorte udfordringer står i historikken.
          </p>
          {/* Reporting one from here too, so the sheet is not a dead end; it lands in the sheet once sent. */}
          {!paying && (
            <div className="mb-6">
              <ChallengeDialog
                opponents={board.roster.filter((m) => m.userId !== user.id)}
                finePriceKr={board.finePriceKr}
                matches={matches}
                triggerClassName="w-full"
              />
            </div>
          )}
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
            children: <BoardPage userId={user.id} board={board} kings={kings.userIds} />,
          },
          {
            href: "/boder/historik",
            title: "Historik",
            children:
              history.length === 0 ? (
                <EmptyState icon="😇">Ingen bøder endnu. Det varer nok ikke længe.</EmptyState>
              ) : (
                <FineHistory fines={history} />
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

/**
 * The board as a league table: place, the player, how many fines and what they come to.
 * Beside the place an arrow says how far they have moved since a week ago (`standings`).
 * Who owes the same shares the place.
 */
function BoardPage({ userId, board, kings }: { userId: string; board: Board; kings: string[] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div
        aria-hidden
        className="grid grid-cols-[2.75rem_1fr_3.25rem_4.5rem_0.5rem] items-center gap-2 border-b border-slate-200 bg-slate-50 py-2 pr-3 pl-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase"
      >
        <span className="text-center">#</span>
        <span>Spiller</span>
        <span className="text-right">Bøder</span>
        <span className="text-right">Kr</span>
        <span />
      </div>
      <ol className="divide-y divide-slate-100">
        {board.standings.map((row) => {
          const person = board.people.get(row.userId);
          if (!person) return null;
          const isMe = row.userId === userId;
          const paid = board.paid.has(row.userId);
          return (
            <li key={row.userId}>
              <Link
                href={playerHref(row.userId)}
                aria-current={isMe ? "true" : undefined}
                className={`press-card grid grid-cols-[2.75rem_1fr_3.25rem_4.5rem_0.5rem] items-center gap-2 py-2.5 pr-3 pl-2 ${
                  isMe ? "bg-[var(--gold-tint)] shadow-[inset_4px_0_0_var(--gold)]" : ""
                }`}
              >
                <span className="flex items-center justify-center gap-0.5">
                  <span className="font-score w-5 text-right text-lg leading-none font-semibold text-slate-700">{row.place}</span>
                  <Movement move={row.move} />
                </span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={person.name} photoId={person.photoId} size="sm" />
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
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
                </span>
                <span className="font-score text-right text-base text-slate-500">{row.units}</span>
                <span className="text-right">
                  {paid ? (
                    <Badge tone="green">Betalt</Badge>
                  ) : row.owesKr > 0 ? (
                    <span className="font-score text-lg font-semibold whitespace-nowrap text-[var(--star)]">{kr(row.owesKr)}</span>
                  ) : (
                    <Badge tone="green">ren tavle</Badge>
                  )}
                </span>
                {/* Opens the player's page, and says so at its end as the history's rows do. */}
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

/** ▲ up the table, ▼ down, a dot for standing still; nothing for somebody new on it. */
function Movement({ move }: { move: number | null }) {
  if (move === null) return <span className="w-3" />;
  if (move === 0)
    return (
      <span className="w-3 text-center text-[10px] text-slate-300" title="Samme plads som for en uge siden">
        •<span className="sr-only">(samme plads som for en uge siden)</span>
      </span>
    );
  const up = move > 0;
  const said = `${up ? "op" : "ned"} ${Math.abs(move)} ${Math.abs(move) === 1 ? "plads" : "pladser"} siden sidste uge`;
  return (
    <span className={`w-3 text-center text-[10px] ${up ? "text-[var(--star)]" : "text-emerald-600"}`} title={said}>
      {up ? "▲" : "▼"}
      <span className="sr-only">({said})</span>
    </span>
  );
}

function CataloguePage({ board, manages }: { board: Board; manages: boolean }) {
  const types = board.fineTypes;
  return (
    <>
      {types.length === 0 && (
        <EmptyState icon="📜">
          {manages ? "Kataloget er tomt. Opret holdets bøder med + nedenfor, så er de klar, når der skal deles ud." : "Kataloget er tomt endnu."}
        </EmptyState>
      )}
      {types.length > 0 && (
        <Card padded={false} className="overflow-hidden">
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
          </ul>
        </Card>
      )}
    </>
  );
}
