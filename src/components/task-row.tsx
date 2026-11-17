import Link from "next/link";
import type { ActivityKind } from "@prisma/client";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { setTaskDone } from "@/app/actions/tasks";
import { deadlineLabel } from "@/lib/time";
import { activityName } from "@/lib/activity";

export type TaskView = {
  id: string;
  title: string;
  dueAt: Date | null;
  doneAt: Date | null;
  match: { id: string; kind: ActivityKind; opponent: string | null; title: string } | null;
  assignees: { user: { id: string; name: string; photoId: string | null } }[];
};

/**
 * One job: what, when, for which activity, who — and its tick. Only those on the job (or
 * an admin, `admin`) can press the tick; everybody else just sees it.
 */
export function TaskRow({
  task,
  viewerId,
  admin = false,
  showMatch = true,
}: {
  task: TaskView;
  viewerId: string;
  admin?: boolean;
  showMatch?: boolean;
}) {
  const due = task.dueAt ? deadlineLabel(task.dueAt) : null;
  const mine = task.assignees.some((a) => a.user.id === viewerId);
  const done = task.doneAt !== null;
  const tick = (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
        done ? "animate-pop border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-transparent"
      }`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {mine || admin ? (
        <ActionButton
          action={setTaskDone}
          fields={{ id: task.id, done: String(!done) }}
          variant="ghost"
          className="p-0!"
          label={
            <>
              {tick}
              <span className="sr-only">{done ? "Markér som ikke udført" : "Markér som udført"}</span>
            </>
          }
        />
      ) : (
        <span role="img" aria-label={done ? "Udført" : "Ikke udført"} className="opacity-60">
          {tick}
        </span>
      )}
      <Link href={`/opgaver/${task.id}`} className="press-card -my-1 min-w-0 flex-1 rounded-lg py-1">
        <p className={`truncate font-medium ${done ? "text-slate-400 line-through" : ""}`}>{task.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {due && !done && <span className={due.overdue ? "font-medium text-amber-700" : ""}>{due.text}</span>}
          {showMatch && task.match && (
            <span>
              {task.match.kind === "MATCH" ? "⚽" : "📅"} {activityName(task.match)}
            </span>
          )}
          {task.assignees.length === 0 && !done && <Badge tone="amber">Ingen har den</Badge>}
        </p>
      </Link>
      <div className="flex -space-x-1.5">
        {task.assignees.slice(0, 3).map((a) => (
          <PlayerLink key={a.user.id} userId={a.user.id} title={a.user.name} aria-label={a.user.name} className="rounded-full ring-2 ring-white">
            <Avatar name={a.user.name} photoId={a.user.photoId} size="sm" />
          </PlayerLink>
        ))}
      </div>
    </li>
  );
}

export const TASK_SELECT = {
  id: true,
  title: true,
  dueAt: true,
  doneAt: true,
  match: { select: { id: true, kind: true, opponent: true, title: true } },
  assignees: { select: { user: { select: { id: true, name: true, photoId: true } } } },
} as const;
