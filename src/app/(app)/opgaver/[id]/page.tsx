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
import { deleteTask, setTaskDone, toggleTakeTask } from "@/app/actions/tasks";

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
  const roster = await teamRoster(user.teamId);
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
              </li>
            ))}
          </ul>
        )}
      </Card>

    </div>
  );
}
