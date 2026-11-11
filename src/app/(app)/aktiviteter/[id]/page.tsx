import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { foundOr404 } from "@/lib/scoped";
import { teamRoster } from "@/lib/roster";
import { fineBoard } from "@/lib/fine-data";
import { fineAmount, fineUnits, kr } from "@/lib/money";
import { kickoffLabel, relativeDay, toLocalDateTimeInput } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { TaskDialog } from "@/components/task-dialog";
import { ActivityDialog } from "@/components/activity-dialog";
import { CopyTasksDialog, StandardTasksDialog } from "@/components/activity-task-dialogs";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ChallengeCard } from "@/components/challenge-card";
import { ActionButton } from "@/components/action-button";
import { deleteActivity } from "@/app/actions/activities";
import { copyableActivities, templateOptions } from "@/lib/activity-data";
import { activityName, KIND_LABEL } from "@/lib/activity";

const person = { select: { id: true, name: true, photoId: true } } as const;

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeamUser();
  const manages = canManageFines(user, user.teamId);
  const db = teamDb(user.teamId);

  const match = await foundOr404(
    db.match.findFirst({
      where: { id },
      include: {
        tasks: { orderBy: { createdAt: "asc" }, select: TASK_SELECT },
        fines: {
          orderBy: { createdAt: "desc" },
          select: { id: true, reason: true, units: true, unitPriceKr: true, player: { select: { name: true } } },
        },
        challenges: {
          orderBy: { createdAt: "desc" },
          include: { challenger: person, opponent: person, match: { select: { opponent: true, title: true } } },
        },
      },
    }),
  );
  const [roster, board, team, templates, copyable] = await Promise.all([
    teamRoster(user.teamId),
    fineBoard(user.teamId),
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } }),
    templateOptions(user.teamId),
    copyableActivities(user.teamId, match.id),
  ]);
  const label = activityName(match);
  const option = [{ id: match.id, label: `${label} · ${kickoffLabel(match.startsAt)}` }];

  return (
    <div>
      <PageHeader
        title={match.kind === "MATCH" && match.opponent ? `${match.isHome === false ? "Ude mod" : match.isHome ? "Hjemme mod" : "Mod"} ${match.opponent}` : match.title}
        action={
          match.source === "MANUAL" && (
            <ActivityDialog
              activity={{
                id: match.id,
                kind: match.kind,
                title: match.title,
                opponent: match.opponent,
                startsAtInput: toLocalDateTimeInput(match.startsAt),
                location: match.location,
                isHome: match.isHome,
                note: match.note,
              }}
            />
          )
        }
      />

      <Card className="mb-8 space-y-2">
        <p className="text-lg font-semibold">
          {kickoffLabel(match.startsAt)} <span className="font-normal text-slate-500">· {relativeDay(match.startsAt)}</span>
        </p>
        {match.location && <p className="text-sm text-slate-600">📍 {match.location}</p>}
        {match.kind === "MATCH" && match.title !== label && <p className="text-sm text-slate-600">{match.title}</p>}
        <div className="flex flex-wrap gap-2">
          {match.cancelledAt && <Badge tone="red">Aflyst</Badge>}
          {match.source === "KAMPKLAR" && <Badge>Fra DBU KampKlar</Badge>}
          {match.kind !== "MATCH" && <Badge>{KIND_LABEL[match.kind]}</Badge>}
        </div>
        {match.note && <p className="text-sm whitespace-pre-line text-slate-600">{match.note}</p>}
      </Card>

      <section className="mb-8">
        <SectionTitle action={<TaskDialog members={roster} activityId={match.id} />}>Opgaver</SectionTitle>
        {(templates.length > 0 || copyable.length > 0) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {templates.length > 0 && <StandardTasksDialog activityId={match.id} templates={templates} />}
            {copyable.length > 0 && <CopyTasksDialog activityId={match.id} copyable={copyable} />}
          </div>
        )}
        {match.tasks.length === 0 ? (
          <EmptyState icon="🧺">Ingen opgaver endnu.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {match.tasks.map((task) => (
                <TaskRow key={task.id} task={task} viewerId={user.id} showMatch={false} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="mb-8">
        <SectionTitle
          action={
            <GiveFineDialog
              members={board.roster}
              fineTypes={board.fineTypes}
              finePriceKr={board.finePriceKr}
              matches={option}
              defaultMatchId={match.id}
            />
          }
        >
          {match.kind === "MATCH" ? "Bøder fra kampen" : "Bøder"}
        </SectionTitle>
        {match.fines.length === 0 ? (
          <EmptyState>Ingen bøder endnu.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {match.fines.map((fine) => (
                <li key={fine.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <strong>{fine.player.name}</strong> · {fine.reason}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {fineUnits(fine.units)} · {kr(fineAmount(fine))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {match.challenges.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Udfordringer</SectionTitle>
          <div className="space-y-3">
            {match.challenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                viewerId={user.id}
                managesFines={manages}
                finePriceKr={team.finePriceKr}
              />
            ))}
          </div>
        </section>
      )}

      {match.source === "MANUAL" && (
        <ActionButton
          action={deleteActivity}
          fields={{ id: match.id }}
          label="Slet aktivitet"
          variant="danger"
          confirm="Slet aktiviteten og dens opgaver?"
          confirmLabel="Slet aktivitet"
        />
      )}
    </div>
  );
}
