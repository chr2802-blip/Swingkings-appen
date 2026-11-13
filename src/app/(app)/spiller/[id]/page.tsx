import { notFound } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canDeleteFine, canManageFines, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { fineBoard, matchOptions } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
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
  const tasks = [...openTasks, ...doneTasks];

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title={person.name}
          action={
            <>
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
            </>
          }
        />

        <Card className="flex items-center gap-4">
          <Avatar name={person.name} photoId={person.photoId} size="lg" />
          <div className="grid flex-1 grid-cols-3 gap-2 text-center">
            <div>
              <p className={`text-lg font-semibold ${account.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(account.owesKr)}</p>
              <p className="text-xs text-slate-500">udestående</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{account.units}</p>
              <p className="text-xs text-slate-500">{account.units === 1 ? "bøde" : "bøder"}</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{kr(account.finedKr)}</p>
              <p className="text-xs text-slate-500">i alt</p>
            </div>
          </div>
        </Card>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {member?.shirtNumber != null && <Badge>#{member.shirtNumber}</Badge>}
          {member?.superAdmin && <Badge tone="accent">{SUPER_ADMIN_LABEL}</Badge>}
          {member && member.role !== "PLAYER" && <Badge tone="accent">{ROLE_LABEL[member.role]}</Badge>}
          {!person.onTeam && <Badge>Ikke længere på holdet</Badge>}
          {managesFines && fines.some((fine) => !fine.clearedAt) && (
            <div className="ml-auto">
              <ActionButton
                action={resetFines}
                fields={{ playerId: id }}
                label="Nulstil bøder"
                confirm={`Nulstil ${person.name}s bøder? Historikken bliver, men der er intet udestående bagefter.`}
                confirmLabel="Nulstil"
              />
            </div>
          )}
        </div>
      </div>

      <section>
        <SectionTitle>Bøder</SectionTitle>
        {fines.length === 0 ? (
          <EmptyState icon="😇">Ingen bøder. Mønsterspiller!</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {fines.map((fine) => (
                <li key={fine.id} className={`flex items-center gap-3 px-4 py-3 ${fine.clearedAt ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{fine.reason}</p>
                    <p className="text-xs text-slate-500">
                      {fineUnits(fine.units)} · {kr(fineAmount(fine))} · {readInZone(fine.createdAt, "d. MMM yyyy")} · givet af{" "}
                      {fine.issuedBy.name}
                      {fine.match && ` · ${fine.match.opponent ?? fine.match.title}`}
                      {fine.clearedAt && ` · nulstillet ${readInZone(fine.clearedAt, "d. MMM yyyy")}`}
                    </p>
                    {fine.note && <p className="mt-1 text-xs text-slate-600">{fine.note}</p>}
                  </div>
                  {canDeleteFine(user, user.teamId, fine) && (
                    <ActionButton
                      action={deleteFine}
                      fields={{ id: fine.id }}
                      label="Slet"
                      variant="ghost"
                      confirm={fine.challengeId ? "Slet bøden? Hele udfordringen bliver trukket tilbage, også den andens del." : "Slet bøden?"}
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
        <SectionTitle>Udfordringer</SectionTitle>
        {challenges.length === 0 ? (
          <EmptyState icon="🤝">Ingen udfordringer endnu.</EmptyState>
        ) : (
          <div className="space-y-3">
            {challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                viewerId={user.id}
                managesFines={managesFines}
                finePriceKr={board.finePriceKr}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Opgaver</SectionTitle>
        {tasks.length === 0 ? (
          <EmptyState icon="🧺">Ingen opgaver.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} viewerId={user.id} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
