import type { Prisma } from "@prisma/client";
import type { TeamUser } from "@/lib/auth";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { Badge } from "@/components/ui";
import { DetailSheet } from "@/components/detail-sheet";
import { TaskDetails, type TaskMember } from "@/components/task-details";
import { deadlineLabel } from "@/lib/time";
import { activityName, KIND_ICON } from "@/lib/activity";
import { isTaskOpen, OPEN_TASK_PARAM } from "@/lib/tasks";

/** Everything a job's row and its sheet draw: read once with the list, so a tap never waits. */
export const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  dueAt: true,
  doneAt: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  doneBy: { select: { id: true, name: true } },
  match: {
    select: { id: true, kind: true, opponent: true, title: true, isHome: true, startsAt: true, endsAt: true, location: true },
  },
  assignees: { select: { user: { select: { id: true, name: true, photoId: true } } } },
  handovers: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fromId: true,
      toId: true,
      inChat: true,
      note: true,
      status: true,
      createdAt: true,
      answeredAt: true,
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
    },
  },
} as const satisfies Prisma.TaskSelect;

export type TaskView = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * One job: what, when, for which activity, and who. A tap opens the job in a sheet with
 * everything about it (`TaskDetails`). Nobody ticks a job off: once its activity's day is
 * over it is done (`isTaskOpen`), and the row is greyed. A job somebody wants to give away
 * says so.
 */
export function TaskRow({
  task,
  user,
  members,
  showMatch = true,
  openTaskId,
}: {
  task: TaskView;
  user: TeamUser;
  members: TaskMember[];
  showMatch?: boolean;
  /** The job a link asked to open (`?opgave=`): its sheet is open on arrival. */
  openTaskId?: string;
}) {
  const due = task.dueAt ? deadlineLabel(task.dueAt) : null;
  const done = !isTaskOpen(task);
  const seeking = !done && task.handovers.some((h) => h.status === "PENDING");
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${done ? "opacity-60" : ""}`}>
      <DetailSheet
        title={task.title}
        initialOpen={openTaskId === task.id}
        clearParam={OPEN_TASK_PARAM}
        triggerClassName="press-card -my-1 min-w-0 flex-1 rounded-lg py-1 text-left"
        trigger={
          <>
            <span className="block truncate font-medium">{task.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {due && !done && <span className={due.overdue ? "font-medium text-amber-700" : ""}>{due.text}</span>}
              {showMatch && task.match && (
                <span>
                  {KIND_ICON[task.match.kind]} {activityName(task.match)}
                </span>
              )}
              {task.assignees.length === 0 && !done && <Badge tone="amber">Ingen har den</Badge>}
              {seeking && <Badge tone="amber">Søger afløser</Badge>}
            </span>
          </>
        }
      >
        <TaskDetails task={task} user={user} members={members} />
      </DetailSheet>
      <div className="flex -space-x-1.5">
        {task.assignees.slice(0, 3).map((a) => (
          <PlayerLink key={a.user.id} userId={a.user.id} title={a.user.name} aria-label={a.user.name} press="icon" className="block ring-2 ring-white">
            <Avatar name={a.user.name} photoId={a.user.photoId} shirtNumber={members.find((m) => m.userId === a.user.id)?.shirtNumber} size="sm" />
          </PlayerLink>
        ))}
      </div>
    </li>
  );
}
