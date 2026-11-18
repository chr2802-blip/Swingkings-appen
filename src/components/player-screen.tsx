import { notFound } from "next/navigation";
import type { TeamUser } from "@/lib/auth";
import { canManageFines, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, fineHistory, matchOptions } from "@/lib/fine-data";
import { fineUnits, kr } from "@/lib/money";
import type { ChallengeStatus } from "@prisma/client";
import { relativeDay } from "@/lib/time";
import Link from "next/link";
import {
  Badge,
  buttonClass,
  Card,
  SectionTitle,
} from "@/components/ui";
import { PayLink } from "@/components/pay-link";
import { afterPaying } from "@/lib/pay";
import { DetailSheet } from "@/components/detail-sheet";
import { Avatar } from "@/components/photo";
import { playerHref } from "@/components/player-link";
import { SwipePages } from "@/components/swipe-pages";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ChallengeDialog } from "@/components/challenge-dialog";
import { TaskDialog } from "@/components/task-dialog";
import { CreateMenu } from "@/components/create-button";
import { upcomingActivities } from "@/lib/activity-data";
import { ActionButton } from "@/components/action-button";
import {
  ChallengeCard,
  challengeCardInclude,
  type ChallengeView,
} from "@/components/challenge-card";
import { TASK_SELECT, TaskRow } from "@/components/task-row";
import { markFinesPaid } from "@/app/actions/fines";
import { firstDaysTasks } from "@/lib/activity";
import { FineHistory, FineRow } from "@/components/fine-history";
import { LiveRefresh } from "@/components/live-refresh";
import { FINES_CHANGED } from "@/lib/realtime-topic";

/** How many settled challenges and finished jobs the page shows; the open ones are always all there. */
const RECENT = 10;
/** How many fines and challenges "Seneste" on the details shows. */
const LATEST = 3;

/** A person's tabs, in the order they are swiped through: details, fines, challenges, jobs. */
export const PLAYER_TABS = ["", "/boder", "/opgaver"] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];

export function playerTabHref(userId: string, tab: PlayerTab = "") {
  return `${playerHref(userId)}${tab}`;
}

/**
 * A person's page: who they are on top, and below it three tabs swiped between — each with
 * its own address, all read at once so a swipe never waits on the server:
 *
 * - **Detaljer**: the three latest fines or challenges, and their next jobs — every one
 *   due on the first day one is.
 * - **Bøder og udfordringer**: one list as in the fine history, the challenges still
 *   waiting above it.
 * - **Opgaver**: their jobs.
 *
 * What their fines come to, how many fines and open jobs they have (and, once the box is
 * open for payment, "Betal" on your own) stands above the tabs.
 * Every name in the app
 * links here. On your own page it is also your profile, with a pencil ("Rediger") to change it.
 *
 * The "+" gives a fine, reports a challenge or makes a job on one of the coming activities —
 * on somebody else's page with them chosen from the start.
 */
export async function PlayerScreen({
  user,
  id,
  show,
}: {
  user: TeamUser;
  id: string;
  show: PlayerTab;
}) {
  const db = teamDb(user.teamId);
  const board = await fineBoard(user.teamId);
  // On the team, or gone from it but still owing: anybody else is "not found".
  const person = board.people.get(id);
  if (!person) notFound();
  const account = board.balances.find((row) => row.userId === id)!;
  const member = board.roster.find((m) => m.userId === id);
  const self = id === user.id;
  const managesFines = canManageFines(user, user.teamId);

  const [fines, matches, activities, openChallenges, pastChallenges, openTasks, doneTasks] =
    await Promise.all([
      fineHistory(user.teamId, { playerId: id }),
      matchOptions(user.teamId),
      upcomingActivities(user.teamId),
      db.challenge.findMany({
        where: { status: "PENDING", OR: [{ winnerId: id }, { loserId: id }] },
        orderBy: { createdAt: "desc" },
        include: challengeCardInclude,
      }),
      db.challenge.findMany({
        where: {
          status: { not: "PENDING" },
          OR: [{ winnerId: id }, { loserId: id }],
        },
        orderBy: { createdAt: "desc" },
        take: RECENT,
        include: challengeCardInclude,
      }),
      db.task.findMany({
        where: { doneAt: null, assignees: { some: { userId: id } } },
        orderBy: [
          { dueAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
        select: TASK_SELECT,
      }),
      db.task.findMany({
        where: { doneAt: { not: null }, assignees: { some: { userId: id } } },
        orderBy: { doneAt: "desc" },
        take: RECENT,
        select: TASK_SELECT,
      }),
    ]);
  const challenges = [...openChallenges, ...pastChallenges];
  const tasks = [...openTasks, ...doneTasks];
  // A settled challenge also left a fine on each side; the challenge stands for both.
  const latest = [
    ...fines
      .filter((fine) => !fine.challenge)
      .map((fine) => ({ kind: "fine" as const, at: fine.createdAt, fine })),
    ...challenges.map((challenge) => ({
      kind: "challenge" as const,
      at: challenge.createdAt,
      challenge,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, LATEST);
  const nextTasks = firstDaysTasks(openTasks);

  const challengeRow = (challenge: ChallengeView) => (
    <ChallengeRow
      key={challenge.id}
      challenge={challenge}
      viewerId={user.id}
      managesFines={managesFines}
      finePriceKr={board.finePriceKr}
    />
  );

  return (
    <div className="space-y-6">
      <LiveRefresh events={[FINES_CHANGED]} />
      <PlayerHeader
        id={id}
        self={self}
        person={person}
        member={member}
        account={account}
        board={board}
        managesFines={managesFines}
        openTasks={openTasks.length}
      />

      <PlayerCreateMenu
        viewerId={user.id}
        id={id}
        onTeam={person.onTeam}
        board={board}
        matches={matches}
        activities={activities}
      />

      <SwipePages
        label="Spillerens sider"
        initial={PLAYER_TABS.indexOf(show)}
        pages={[
          {
            href: playerTabHref(id),
            title: "Detaljer",
            children: (
              <div className="space-y-6">
                <section aria-labelledby="latest-title">
                  <SectionTitle>
                    <span id="latest-title">Seneste</span>
                  </SectionTitle>
                  {latest.length === 0 ? (
                    <Empty>Ingen bøder eller udfordringer endnu.</Empty>
                  ) : (
                    <Card padded={false}>
                      <ul className="divide-y divide-slate-100">
                        {latest.map((item) =>
                          item.kind === "fine" ? (
                            <FineRow key={item.fine.id} fine={item.fine} />
                          ) : (
                            challengeRow(item.challenge)
                          ),
                        )}
                      </ul>
                    </Card>
                  )}
                </section>

                <section aria-labelledby="next-task-title">
                  <SectionTitle>
                    <span id="next-task-title">
                      {nextTasks.length > 1 ? "Næste opgaver" : "Næste opgave"}
                    </span>
                  </SectionTitle>
                  {nextTasks.length > 0 ? (
                    <List>
                      {nextTasks.map((task) => (
                        <TaskRow key={task.id} task={task} user={user} members={board.roster} />
                      ))}
                    </List>
                  ) : (
                    <Empty>Ingen opgaver lige nu.</Empty>
                  )}
                </section>
              </div>
            ),
          },
          {
            href: playerTabHref(id, "/boder"),
            title: "Bøder og udfordringer",
            // One list as in the history: fines given (star) and those a challenge moved
            // (swords). A challenge still waiting has moved nothing yet, so it stands above.
            children: (
              <div className="space-y-8">
                {openChallenges.length > 0 && (
                  <section aria-labelledby="pending-title">
                    <SectionTitle>
                      <span id="pending-title">Venter på godkendelse</span>
                    </SectionTitle>
                    <List>{openChallenges.map(challengeRow)}</List>
                  </section>
                )}
                {fines.length === 0 ? (
                  <Empty>
                    Ingen bøder eller udfordringer. Mønsterspiller! 😇
                  </Empty>
                ) : (
                  <FineHistory fines={fines} />
                )}
              </div>
            ),
          },
          {
            href: playerTabHref(id, "/opgaver"),
            title:
              openTasks.length > 0
                ? `Opgaver (${openTasks.length})`
                : "Opgaver",
            children:
              tasks.length === 0 ? (
                <Empty>Ingen opgaver.</Empty>
              ) : (
                <List>
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} user={user} members={board.roster} />
                  ))}
                </List>
              ),
          },
        ]}
      />
    </div>
  );
}

type Board = Awaited<ReturnType<typeof fineBoard>>;

/**
 * The page's "+": a fine and a challenge (not while the box is open for payment, when the
 * sums stand still) and a job on a coming activity. On somebody else's page — while they
 * are on the team — they are the one fined, played against or given the job.
 */
function PlayerCreateMenu({
  viewerId,
  id,
  onTeam,
  board,
  matches,
  activities,
}: {
  viewerId: string;
  id: string;
  onTeam: boolean;
  board: Board;
  matches: Awaited<ReturnType<typeof matchOptions>>;
  activities: Awaited<ReturnType<typeof upcomingActivities>>;
}) {
  const paying = board.paymentOpenedAt !== null;
  const other = onTeam && id !== viewerId ? id : undefined;
  if (paying && activities.length === 0) return null;
  return (
    <CreateMenu>
      {!paying && (
        <GiveFineDialog
          members={board.roster}
          fineTypes={board.fineTypes}
          finePriceKr={board.finePriceKr}
          matches={matches}
          defaultPlayerId={onTeam ? id : undefined}
        />
      )}
      {!paying && (
        <ChallengeDialog
          opponents={board.roster.filter((m) => m.userId !== viewerId)}
          finePriceKr={board.finePriceKr}
          matches={matches}
          defaultOpponentId={other}
        />
      )}
      {activities.length > 0 && (
        <TaskDialog
          members={board.roster}
          activities={activities}
          defaultAssigneeId={other}
          triggerLabel="Opret opgave"
        />
      )}
    </CreateMenu>
  );
}

/**
 * Who they are, what their fines come to, and — once the box is open for payment — "Betal"
 * on your own page and "Markér som betalt" for the treasurer: what stands above the tabs.
 */
function PlayerHeader({
  id,
  self,
  person,
  member,
  account,
  board,
  managesFines,
  openTasks,
}: {
  id: string;
  self: boolean;
  person: NonNullable<ReturnType<Board["people"]["get"]>>;
  member: Board["roster"][number] | undefined;
  account: Board["balances"][number];
  board: Board;
  managesFines: boolean;
  /** Their jobs not yet done, counted beside their fines. */
  openTasks: number;
}) {
  const paying = board.paymentOpenedAt !== null;
  const paid = board.paid.has(id);
  const badges = [
    member?.shirtNumber != null && `#${member.shirtNumber}`,
    member?.superAdmin && SUPER_ADMIN_LABEL,
    member && member.role !== "PLAYER" && ROLE_LABEL[member.role],
    !person.onTeam && "Ikke længere på holdet",
  ].filter((badge): badge is string => typeof badge === "string");
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={person.name} photoId={person.photoId} size="md" />
        <div className="min-w-0 flex-1">
          {/* The whole name, over two lines if need be: never cut short. */}
          <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {person.name}
          </h1>
          {badges.length > 0 && (
            <p className="truncate text-xs text-slate-500">
              {badges.join(" · ")}
            </p>
          )}
          {member && (
            <p className="mt-1 flex flex-wrap items-center gap-2">
              {member.duesPaid ? (
                <Badge tone="green">Kontingent betalt</Badge>
              ) : (
                <Badge tone="amber">Mangler kontingent</Badge>
              )}
              {self && !member.duesPaid && board.payLink && (
                <PayLink
                  kind="dues"
                  link={board.payLink}
                  amountKr={board.duesKr}
                  name={person.name}
                  className="text-xs font-medium text-[var(--accent)]"
                >
                  Betal kontingent
                  {board.duesKr ? ` (${kr(board.duesKr)})` : ""} ›
                </PayLink>
              )}
            </p>
          )}
        </div>
        {self && (
          <Link
            href="/profil"
            aria-label="Rediger"
            title="Rediger"
            className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </Link>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl border border-slate-200 bg-white py-2 text-center shadow-sm">
        <Stat
          label={paid ? "betalt" : paying ? "skal betales" : "bøder i alt"}
          value={kr(account.owesKr)}
          tone={paid || account.owesKr === 0 ? "text-emerald-700" : "text-red-600"}
        />
        <Stat
          label={account.units === 1 ? "bøde" : "bøder"}
          value={String(account.units)}
        />
        <Stat label={openTasks === 1 ? "opgave" : "opgaver"} value={String(openTasks)} />
      </dl>
      {paying && paid && (
        <p className="mt-3 text-center text-sm font-medium text-emerald-700">✅ Bøderne er betalt</p>
      )}
      {self && paying && !paid && account.owesKr > 0 && board.payLink && (
        <>
          <PayLink
            kind="fines"
            link={board.payLink}
            amountKr={account.owesKr}
            name={person.name}
            className={buttonClass("primary", "mt-3 w-full")}
          >
            💸 Betal {kr(account.owesKr)} med MobilePay
          </PayLink>
          <p className="mt-1.5 text-center text-xs text-slate-500">
            {afterPaying("fines")}
          </p>
        </>
      )}
      {managesFines && paying && member && (paid || account.owesKr > 0) && (
        <div className="mt-3 flex justify-center">
          <ActionButton
            action={markFinesPaid}
            fields={{ playerId: id, paid: paid ? "0" : "1" }}
            label={paid ? "Fortryd betalt" : `Markér ${kr(account.owesKr)} som betalt`}
            variant={paid ? "ghost" : "secondary"}
          />
        </div>
      )}
    </div>
  );
}

/** A challenge as a short row; tapped, it opens in full. */
function ChallengeRow({
  challenge,
  viewerId,
  managesFines,
  finePriceKr,
}: {
  challenge: ChallengeView;
  viewerId: string;
  managesFines: boolean;
  finePriceKr: number;
}) {
  return (
    <li>
      <DetailSheet
        title="Udfordring"
        triggerClassName="press-card flex w-full items-center gap-3 px-4 py-2 text-left"
        trigger={
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                <span className="font-medium">{challenge.winner.name} 🏆</span>{" "}
                slog {challenge.loser.name}
              </span>
              <span className="block truncate text-xs text-slate-500">
                “{challenge.description}” · {fineUnits(challenge.units)} ·{" "}
                {relativeDay(challenge.createdAt)}
              </span>
            </span>
            <Badge tone={CHALLENGE_TONE[challenge.status]}>
              {CHALLENGE_SHORT[challenge.status]}
            </Badge>
          </>
        }
      >
        <ChallengeCard
          challenge={challenge}
          viewerId={viewerId}
          managesFines={managesFines}
          finePriceKr={finePriceKr}
        />
      </DetailSheet>
    </li>
  );
}


function List({ children }: { children: React.ReactNode }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

const CHALLENGE_SHORT: Record<ChallengeStatus, string> = {
  PENDING: "Venter",
  SETTLED: "Godkendt",
};
const CHALLENGE_TONE: Record<ChallengeStatus, "amber" | "green"> = {
  PENDING: "amber",
  SETTLED: "green",
};
