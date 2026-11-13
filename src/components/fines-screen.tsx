import Link from "next/link";
import type { TeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, fineHistory, matchOptions, monthKings } from "@/lib/fine-data";
import { waitsOn } from "@/lib/challenges";
import { fineUnits, kr } from "@/lib/money";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { SwipePages } from "@/components/swipe-pages";
import { DetailSheet } from "@/components/detail-sheet";
import { FineHistory } from "@/components/fine-history";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ChallengeCard, challengeCardInclude } from "@/components/challenge-card";
import { ChallengeDialog } from "@/components/challenge-dialog";
import { FineTypeDialog } from "@/components/fine-type-dialog";
import { ActionButton } from "@/components/action-button";
import { ActionMenu } from "@/components/action-menu";
import { removeFineType, resetFines } from "@/app/actions/fines";
import { Crown } from "@/components/crest";

/** How many fines the board's page shows; the rest are on /boder/historik. */
const RECENT = 5;

/** The pages of the fine box, in the order they are swiped through. */
export const FINE_PAGES = ["/boder", "/boder/katalog"] as const;

/** `/boder?udfordringer` opens the board with the pending challenges on top (a notification's link). */
export const CHALLENGES_PARAM = "udfordringer";

/** How many settled or withdrawn challenges the challenges' sheet shows under the pending ones. */
const CLOSED_SHOWN = 5;

type Board = Awaited<ReturnType<typeof fineBoard>>;

/**
 * The fine box: the board and the catalogue as one screen to swipe across. Each has its
 * own address (`show`), and both are read at once, so a swipe never waits on the server.
 * Challenges have no page of their own: the board says how many wait for approval, and a
 * tap opens them in a sheet (`openChallenges` opens it on arrival).
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
  // One fine more than shown, so the page knows whether there is a history worth linking to.
  const [board, kings, recent, matches, open, closed] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    fineHistory(user.teamId, RECENT + 1),
    matchOptions(user.teamId),
    db.challenge.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, include: challengeCardInclude }),
    db.challenge.findMany({
      where: { status: { in: ["SETTLED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: CLOSED_SHOWN,
      include: challengeCardInclude,
    }),
  ]);
  const manages = canManageFines(user, user.teamId);

  // What is waiting on the viewer goes first: it is the reason they opened the page.
  const waiting = open.filter((c) => waitsOn(c, user.id));
  const others = open.filter((c) => !waiting.includes(c));
  const card = (c: (typeof open)[number]) => (
    <ChallengeCard key={c.id} challenge={c} viewerId={user.id} managesFines={manages} finePriceKr={board.finePriceKr} />
  );

  return (
    <SwipePages
      initial={FINE_PAGES.indexOf(show)}
      pages={[
        {
          href: "/boder",
          title: "Bødekassen",
          action: (
            <>
              <ChallengeDialog
                opponents={board.roster.filter((m) => m.userId !== user.id)}
                finePriceKr={board.finePriceKr}
                matches={matches}
              />
              <GiveFineDialog members={board.roster} fineTypes={board.fineTypes} finePriceKr={board.finePriceKr} matches={matches} />
            </>
          ),
          children: (
            <BoardPage
              user={user}
              board={board}
              kings={kings.userIds}
              recent={recent}
              manages={manages}
              challenges={
                <DetailSheet
                  title="Udfordringer"
                  hidden={open.length === 0}
                  initialOpen={openChallenges}
                  clearParam={CHALLENGES_PARAM}
                  triggerClassName="press-card mb-6 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-900"
                  trigger={
                    <>
                      <span aria-hidden className="text-xl">
                        ⚔️
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {open.length} {open.length === 1 ? "udfordring venter" : "udfordringer venter"} på godkendelse
                      </span>
                      {waiting.length > 0 && <Badge tone="amber">{waiting.length} på dig</Badge>}
                      <span aria-hidden>›</span>
                    </>
                  }
                >
                  <p className="mb-6 text-sm text-slate-500">
                    Meld resultatet, en anden godkender, og taberen overtager indsatsen.
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
                  {open.length === 0 && (
                    <div className="mb-8">
                      <EmptyState icon="⚔️">Ingen udfordringer venter.</EmptyState>
                    </div>
                  )}
                  {closed.length > 0 && (
                    <section>
                      <SectionTitle>Senest afgjort</SectionTitle>
                      <div className="space-y-3">{closed.map(card)}</div>
                    </section>
                  )}
                </DetailSheet>
              }
            />
          ),
        },
        {
          href: "/boder/katalog",
          title: "Bødekatalog",
          action: manages && <FineTypeDialog finePriceKr={board.finePriceKr} />,
          children: <CataloguePage board={board} manages={manages} />,
        },
      ]}
    />
  );
}

function BoardPage({
  user,
  board,
  kings,
  recent,
  manages,
  challenges,
}: {
  user: TeamUser;
  board: Board;
  kings: string[];
  recent: Awaited<ReturnType<typeof fineHistory>>;
  manages: boolean;
  /** The pending challenges' banner and the sheet it opens. */
  challenges: React.ReactNode;
}) {
  const totals = board.balances.reduce(
    (sum, row) => ({ fined: sum.fined + row.finedKr, owed: sum.owed + row.owesKr }),
    { fined: 0, owed: 0 },
  );
  const mine = board.balances.find((row) => row.userId === user.id);

  return (
    <>
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
      </Card>

      {challenges}

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
    </>
  );
}

function CataloguePage({ board, manages }: { board: Board; manages: boolean }) {
  const types = board.fineTypes;
  return (
    <>
      <p className="mb-6 text-sm text-slate-500">Hvad koster hvad. 1 bøde = {kr(board.finePriceKr)}.</p>
      {types.length === 0 ? (
        <EmptyState icon="📜">
          {manages ? "Kataloget er tomt. Opret holdets bøder, så er de klar, når der skal deles ud." : "Kataloget er tomt endnu."}
        </EmptyState>
      ) : (
        <Card padded={false}>
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
          </ul>
        </Card>
      )}
    </>
  );
}
