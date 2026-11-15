import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { foundOr404 } from "@/lib/scoped";
import { teamRoster } from "@/lib/roster";
import { deadlineLabel, formatInZone, kickoffLabel, readInZone } from "@/lib/time";
import { activityName } from "@/lib/activity";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { ActionMenu } from "@/components/action-menu";
import { EditTaskDialog } from "@/components/edit-task-dialog";
import { HandoverDialog } from "@/components/handover-dialog";
import { answerHandover, deleteTask, setTaskDone, toggleTakeTask, withdrawHandover } from "@/app/actions/tasks";

const HANDOVER_STATUS = {
  PENDING: { text: "Venter på svar", tone: "amber" },
  ACCEPTED: { text: "Godkendt", tone: "green" },
  DECLINED: { text: "Afvist", tone: "neutral" },
  WITHDRAWN: { text: "Trukket tilbage", tone: "neutral" },
} as const;

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeamUser();
  const task = await foundOr404(
    teamDb(user.teamId).task.findFirst({
      where: { id },
      include: {
        match: { select: { id: true, kind: true, title: true, opponent: true, startsAt: true } },
        createdBy: { select: { id: true, name: true } },
        doneBy: { select: { id: true, name: true } },
        assignees: { select: { user: { select: { id: true, name: true, photoId: true } } } },
      },
    }),
  );
  const [roster, handovers] = await Promise.all([
    teamRoster(user.teamId),
    teamDb(user.teamId).taskHandover.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "desc" },
      include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
    }),
  ]);
  const pending = handovers.filter((h) => h.status === "PENDING");
  const askedMe = task.doneAt ? undefined : pending.find((h) => h.toId === user.id);
  const myRequest = pending.find((h) => h.fromId === user.id);
  const canEdit = task.createdById === user.id || canAdministerTeam(user, user.teamId);
  const mine = task.assignees.some((a) => a.user.id === user.id);
  const due = task.dueAt ? deadlineLabel(task.dueAt) : null;

  return (
    <div>
      <PageHeader
        title={task.title}
        action={
          <ActionMenu>
            <ActionButton
              action={setTaskDone}
              fields={{ id: task.id, done: String(!task.doneAt) }}
              label={task.doneAt ? "Markér som ikke udført" : "Markér som udført ✓"}
            />
            {!task.doneAt && (
              <ActionButton action={toggleTakeTask} fields={{ id: task.id }} label={mine ? "Tag mig af opgaven" : "Jeg tager den"} />
            )}
            {!task.doneAt && mine && !myRequest && (
              <HandoverDialog
                taskId={task.id}
                members={roster.filter((m) => !task.assignees.some((a) => a.user.id === m.userId))}
              />
            )}
            {canEdit && (
              <EditTaskDialog
                members={roster}
                task={{
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  dueOn: task.dueAt && (!task.match || task.dueAt.getTime() !== task.match.startsAt.getTime()) ? formatInZone(task.dueAt, "yyyy-MM-dd") : "",
                  hasMatch: task.match !== null,
                  assigneeIds: task.assignees.map((a) => a.user.id),
                }}
              />
            )}
            {canEdit && (
              <ActionButton
                action={deleteTask}
                fields={{ id: task.id }}
                label="Slet opgave"
                variant="danger"
                confirm="Slet opgaven?"
                confirmLabel="Slet opgaven"
              />
            )}
          </ActionMenu>
        }
      />
      {askedMe && (
        <Card className="mb-4 space-y-3 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium">
            <PlayerLink userId={askedMe.from.id}>{askedMe.from.name}</PlayerLink> spørger, om du vil overtage opgaven.
          </p>
          {askedMe.note && <p className="text-sm whitespace-pre-line text-slate-700">“{askedMe.note}”</p>}
          <div className="flex gap-2">
            <ActionButton action={answerHandover} fields={{ id: askedMe.id, answer: "accept" }} label="Ja, jeg tager den" variant="primary" />
            <ActionButton action={answerHandover} fields={{ id: askedMe.id, answer: "decline" }} label="Nej tak" />
          </div>
        </Card>
      )}
      {myRequest && (
        <Card className="mb-4 space-y-3">
          <p className="text-sm">
            Du har spurgt <PlayerLink userId={myRequest.to.id}>{myRequest.to.name}</PlayerLink>, om de vil overtage opgaven. Du har
            den, indtil de siger ja.
          </p>
          <ActionButton action={withdrawHandover} fields={{ id: myRequest.id }} label="Træk forespørgslen tilbage" />
        </Card>
      )}
      <Card className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {task.doneAt ? (
            <Badge tone="green">
              Udført {readInZone(task.doneAt, "d. MMM")}
              {task.doneBy && (
                <>
                  {" af "}
                  <PlayerLink userId={task.doneBy.id}>{task.doneBy.name}</PlayerLink>
                </>
              )}
            </Badge>
          ) : (
            due && <Badge tone={due.overdue ? "amber" : "neutral"}>{due.text}</Badge>
          )}
        </div>
        {task.match && (
          <Link href={`/aktiviteter/${task.match.id}`} className="block text-sm font-medium text-[var(--accent-text)] underline">
            {task.match.kind === "MATCH" ? "⚽" : "📅"} {activityName(task.match)} · {kickoffLabel(task.match.startsAt)}
          </Link>
        )}
        {task.description && <p className="text-sm whitespace-pre-line text-slate-700">{task.description}</p>}
        <p className="text-xs text-slate-500">
          Oprettet {readInZone(task.createdAt, "d. MMM")} {task.createdBy ? (
            <>
              af <PlayerLink userId={task.createdBy.id}>{task.createdBy.name}</PlayerLink>
            </>
          ) : (
            "automatisk"
          )}
        </p>
      </Card>

      <SectionTitle>Hvem</SectionTitle>
      <Card className="mb-6">
        {task.assignees.length === 0 ? (
          <p className="text-sm text-slate-500">Ingen har opgaven endnu.</p>
        ) : (
          <ul className="space-y-2">
            {task.assignees.map((a) => (
              <li key={a.user.id}>
                <PlayerLink userId={a.user.id} className="flex w-fit items-center gap-2 text-sm">
                  <Avatar name={a.user.name} photoId={a.user.photoId} size="sm" />
                  {a.user.name}
                </PlayerLink>
                {pending
                  .filter((h) => h.fromId === a.user.id)
                  .map((h) => (
                    <p key={h.id} className="ml-10 text-xs text-amber-700">
                      Har spurgt {h.to.name}, om de vil overtage
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {handovers.length > 0 && (
        <>
          <SectionTitle>Historik</SectionTitle>
          <Card className="mb-6">
            <ol className="space-y-3">
              {handovers.map((h) => (
                <li key={h.id} className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <PlayerLink userId={h.from.id}>{h.from.name}</PlayerLink> bad <PlayerLink userId={h.to.id}>{h.to.name}</PlayerLink>{" "}
                      overtage opgaven
                    </span>
                    <Badge tone={HANDOVER_STATUS[h.status].tone}>{HANDOVER_STATUS[h.status].text}</Badge>
                  </div>
                  {h.note && <p className="text-slate-600">“{h.note}”</p>}
                  <p className="text-xs text-slate-500">
                    {readInZone(h.createdAt, "d. MMM 'kl.' HH:mm")}
                    {h.answeredAt && ` · ${h.status === "WITHDRAWN" ? "trukket tilbage" : "svar"} ${readInZone(h.answeredAt, "d. MMM 'kl.' HH:mm")}`}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
