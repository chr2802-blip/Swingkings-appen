import { notFound } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canDeleteFine, canManageFines, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, matchOptions } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import type { ChallengeStatus } from "@prisma/client";
import { readInZone, relativeDay } from "@/lib/time";
import { Badge, ButtonLink, Card, SectionTitle } from "@/components/ui";
import { DetailSheet } from "@/components/detail-sheet";
import { Avatar } from "@/components/photo";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ActionButton } from "@/components/action-button";
import { ChallengeCard, challengeCardInclude } from "@/components/challenge-card";
import { TASK_SELECT, TaskRow } from "@/components/task-row";
import { deleteFine, resetFines } from "@/app/actions/fines";

/** How many settled challenges and finished jobs the page shows; the open ones are always all there. */
const RECENT = 10;

/**
 * A person's page: their fines, challenges and jobs on this team. Every name in the app
 * links here. On your own page it is also your profile, with "Rediger" to change it.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const board = await fineBoard(user.teamId);
  // On the team, or gone from it but still owing: anybody else is "not found".
  const person = board.people.get(id);
  if (!person) notFound();
  const account = board.balances.find((row) => row.userId === id)!;
  const member = board.roster.find((m) => m.userId === id);
  const self = id === user.id;
  const managesFines = canManageFines(user, user.teamId);

  const [fines, matches, openChallenges, pastChallenges, openTasks, doneTasks] = await Promise.all([
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
    db.challenge.findMany({
      where: { status: "PENDING", OR: [{ winnerId: id }, { loserId: id }] },
      orderBy: { createdAt: "desc" },
      include: challengeCardInclude,
    }),
    db.challenge.findMany({
      where: { status: { not: "PENDING" }, OR: [{ winnerId: id }, { loserId: id }] },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      include: challengeCardInclude,
    }),
    db.task.findMany({
      where: { doneAt: null, assignees: { some: { userId: id } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
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
  const badges = [
    member?.shirtNumber != null && `#${member.shirtNumber}`,
    member?.superAdmin && SUPER_ADMIN_LABEL,
    member && member.role !== "PLAYER" && ROLE_LABEL[member.role],
    !person.onTeam && "Ikke længere på holdet",
  ].filter((badge): badge is string => typeof badge === "string");
  const tasks = [...openTasks, ...doneTasks];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Avatar name={person.name} photoId={person.photoId} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{person.name}</h1>
            {badges.length > 0 && <p className="truncate text-xs text-slate-500">{badges.join(" · ")}</p>}
            {member && (
              <p className="mt-1">
                {member.duesPaid ? <Badge tone="green">Kontingent betalt</Badge> : <Badge tone="amber">Mangler kontingent</Badge>}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {self && (
              <ButtonLink href="/profil" variant="secondary">
                Rediger
              </ButtonLink>
            )}
            {person.onTeam && (
              <GiveFineDialog
                members={board.roster}
                fineTypes={board.fineTypes}
                finePriceKr={board.finePriceKr}
                matches={matches}
                defaultPlayerId={id}
              />
            )}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl border border-slate-200 bg-white py-2 text-center shadow-sm">
          <Stat label="udestående" value={kr(account.owesKr)} tone={account.owesKr > 0 ? "text-red-600" : "text-emerald-700"} />
          <Stat label={account.units === 1 ? "bøde" : "bøder"} value={String(account.units)} />
          <Stat label="i alt" value={kr(account.finedKr)} />
        </dl>
      </div>

      <section>
        <SectionTitle
          action={
            managesFines &&
            fines.some((fine) => !fine.clearedAt) && (
              <ActionButton
                action={resetFines}
                fields={{ playerId: id }}
                label="Nulstil bøder"
                variant="ghost"
                className="py-0! text-xs"
                confirm={`Nulstil ${person.name}s bøder? Historikken bliver, men der er intet udestående bagefter.`}
                confirmLabel="Nulstil"
              />
            )
          }
        >
          Bøder ({fines.length})
        </SectionTitle>
        {fines.length === 0 ? (
          <Empty>Ingen bøder. Mønsterspiller! 😇</Empty>
        ) : (
          <Rows
            items={fines}
            render={(fine) => (
              <li key={fine.id} className={`flex items-center gap-3 px-4 py-2 ${fine.clearedAt ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fine.reason}</p>
                  <p className="truncate text-xs text-slate-500">
                    {readInZone(fine.createdAt, "d. MMM yyyy")} · {fine.issuedBy.name}
                    {fine.match && ` · ${fine.match.opponent ?? fine.match.title}`}
                    {fine.clearedAt && ` · nulstillet ${readInZone(fine.clearedAt, "d. MMM yyyy")}`}
                    {fine.note && ` · ${fine.note}`}
                  </p>
                </div>
                <span className="shrink-0 text-right text-sm">
                  {kr(fineAmount(fine))}
                  <span className="block text-xs text-slate-500">{fineUnits(fine.units)}</span>
                </span>
                {canDeleteFine(user, user.teamId, fine) && (
                  <ActionButton
                    action={deleteFine}
                    fields={{ id: fine.id }}
                    label="Slet"
                    variant="ghost"
                    className="-mr-2 px-2! text-xs"
                    confirm={fine.challengeId ? "Slet bøden? Hele udfordringen bliver trukket tilbage, også den andens del." : "Slet bøden?"}
                    confirmLabel="Slet bøden"
                  />
                )}
              </li>
            )}
          />
        )}
      </section>

      <section>
        <SectionTitle>Udfordringer ({challenges.length})</SectionTitle>
        {challenges.length === 0 ? (
          <Empty>Ingen udfordringer endnu.</Empty>
        ) : (
          <Rows
            items={challenges}
            render={(challenge) => (
              <li key={challenge.id}>
                <DetailSheet
                  title="Udfordring"
                  triggerClassName="press-card flex w-full items-center gap-3 px-4 py-2 text-left"
                  trigger={
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          <span className="font-medium">{challenge.winner.name} 🏆</span> slog {challenge.loser.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          “{challenge.description}” · {fineUnits(challenge.units)} · {relativeDay(challenge.createdAt)}
                        </span>
                      </span>
                      <Badge tone={CHALLENGE_TONE[challenge.status]}>{CHALLENGE_SHORT[challenge.status]}</Badge>
                    </>
                  }
                >
                  <ChallengeCard
                    challenge={challenge}
                    viewerId={user.id}
                    managesFines={managesFines}
                    finePriceKr={board.finePriceKr}
                  />
                </DetailSheet>
              </li>
            )}
          />
        )}
      </section>

      <section>
        <SectionTitle>Opgaver ({openTasks.length} åbne)</SectionTitle>
        {tasks.length === 0 ? (
          <Empty>Ingen opgaver.</Empty>
        ) : (
          <Rows items={tasks} render={(task) => <TaskRow key={task.id} task={task} viewerId={user.id} />} />
        )}
      </section>
    </div>
  );
}

/** How many rows a list shows before the rest wait behind "Vis alle". */
const SHOWN = 5;

/** A list in a card, the first few rows shown and the rest folded away (no script needed). */
function Rows<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-slate-100">{items.slice(0, SHOWN).map(render)}</ul>
      {items.length > SHOWN && (
        <details className="group border-t border-slate-100">
          <summary className="press-card cursor-pointer list-none px-4 py-2 text-center text-sm font-medium text-[var(--accent-text)] group-open:hidden">
            Vis alle {items.length}
          </summary>
          <ul className="divide-y divide-slate-100">{items.slice(SHOWN).map(render)}</ul>
        </details>
      )}
    </Card>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm text-slate-500">{children}</p>;
}

const CHALLENGE_SHORT: Record<ChallengeStatus, string> = { PENDING: "Venter", SETTLED: "Godkendt", CANCELLED: "Trukket" };
const CHALLENGE_TONE: Record<ChallengeStatus, "amber" | "green" | "neutral"> = { PENDING: "amber", SETTLED: "green", CANCELLED: "neutral" };
