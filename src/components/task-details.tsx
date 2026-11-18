import Link from "next/link";
import type { TeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { isTaskOpen } from "@/lib/tasks";
import { activityTitle, KIND_ICON, KIND_LABEL } from "@/lib/activity";
import { deadlineLabel, formatInZone, kickoffLabel, readInZone, relativeDay } from "@/lib/time";
import { Badge } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { EditTaskDialog } from "@/components/edit-task-dialog";
import { GiveAwayDialog } from "@/components/handover-dialog";
import { answerHandover, deleteTask, withdrawHandover } from "@/app/actions/tasks";
import type { TaskView } from "@/components/task-row";

export type TaskMember = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

const HANDOVER_STATUS = {
  PENDING: { text: "Venter", tone: "amber" },
  ACCEPTED: { text: "Godkendt", tone: "green" },
  DECLINED: { text: "Afvist", tone: "neutral" },
  WITHDRAWN: { text: "Trukket tilbage", tone: "neutral" },
} as const;

/**
 * Everything about one job, in the order one needs it: an answer asked of you, what the
 * job belongs to, when and what, who has it (and who wants to give it away), what you can
 * do, and what has happened to it. Drawn in the sheet behind every job's row, and on the
 * page an old job without an activity still has.
 */
export function TaskDetails({ task, user, members }: { task: TaskView; user: TeamUser; members: TaskMember[] }) {
  const pending = task.handovers.filter((h) => h.status === "PENDING");
  const done = !isTaskOpen(task);
  const mine = task.assignees.some((a) => a.user.id === user.id);
  const askedMe = done ? undefined : pending.find((h) => h.toId === user.id);
  /** Asked in the chat by somebody on the job: anybody not on it may say yes. */
  const askedTeam = done || mine ? [] : pending.filter((h) => h.inChat);
  const myRequest = pending.find((h) => h.fromId === user.id);
  const admin = canAdministerTeam(user, user.teamId);
  const canEdit = task.createdById === user.id || admin;
  const canGiveAway = !done && mine && !myRequest;
  const due = task.dueAt ? deadlineLabel(task.dueAt) : null;

  const facts: [string, React.ReactNode][] = [];
  if (done) {
    // Ticked off back when that could be done, it says when and by whom; otherwise its day is over.
    facts.push([
      "Udført",
      task.doneAt ? (
        <span key="done">
          {readInZone(task.doneAt, "d. MMM")}
          {task.doneBy && (
            <>
              {" af "}
              <PlayerLink userId={task.doneBy.id}>{task.doneBy.name}</PlayerLink>
            </>
          )}
        </span>
      ) : (
        <span key="done">{task.match ? "Aktiviteten er overstået" : "Fristen er overstået"}</span>
      ),
    ]);
  } else if (due) {
    facts.push([
      "Frist",
      <span key="due" className={due.overdue ? "font-medium text-amber-700" : ""}>
        {due.overdue ? due.text : `${readInZone(task.dueAt!, "EEEE d. MMMM")} · ${relativeDay(task.dueAt!)}`}
      </span>,
    ]);
  }
  if (task.description) facts.push(["Beskrivelse", <span key="desc" className="whitespace-pre-line">{task.description}</span>]);
  facts.push([
    "Oprettet",
    <span key="created">
      {readInZone(task.createdAt, "d. MMM")}{" "}
      {task.createdBy ? (
        <>
          af <PlayerLink userId={task.createdBy.id}>{task.createdBy.name}</PlayerLink>
        </>
      ) : (
        "automatisk"
      )}
    </span>,
  ]);

  return (
    <div className="space-y-6">
      {askedMe && (
        <AnswerBox name={askedMe.from.name} userId={askedMe.from.id} note={askedMe.note} text="spørger, om du vil overtage opgaven.">
          <ActionButton action={answerHandover} fields={{ id: askedMe.id, answer: "accept" }} label="Ja, jeg tager den" variant="primary" />
          <ActionButton action={answerHandover} fields={{ id: askedMe.id, answer: "decline" }} label="Nej tak" />
        </AnswerBox>
      )}
      {askedTeam.map((h) => (
        <AnswerBox key={h.id} name={h.from.name} userId={h.from.id} note={h.note} text="søger en afløser i chatten.">
          <ActionButton action={answerHandover} fields={{ id: h.id, answer: "accept" }} label="Jeg tager den" variant="primary" />
        </AnswerBox>
      ))}

      {task.match && (
        <Link
          href={`/aktiviteter/${task.match.id}`}
          className="press-card flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 hover:no-underline"
        >
          <span aria-hidden className="text-2xl">
            {KIND_ICON[task.match.kind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Opgave til {KIND_LABEL[task.match.kind].toLowerCase()}
            </span>
            <span className="block truncate font-semibold">{activityTitle(task.match)}</span>
            <span className="block text-sm text-slate-600">
              {kickoffLabel(task.match.startsAt)}
              {task.match.endsAt && `–${readInZone(task.match.endsAt, "HH:mm")}`} · {relativeDay(task.match.startsAt)}
            </span>
            {task.match.location && <span className="block truncate text-sm text-slate-500">📍 {task.match.location}</span>}
          </span>
          <span aria-hidden className="text-slate-400">
            ›
          </span>
          <span className="sr-only">Gå til aktiviteten</span>
        </Link>
      )}

      <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-3 px-4 py-2.5 text-sm">
            <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
            <dd className="min-w-0 flex-1 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Hvem har opgaven">
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">Hvem har opgaven</h3>
        {task.assignees.length === 0 ? (
          <p className="text-sm text-slate-500">Ingen har opgaven endnu.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {task.assignees.map((a) => {
              const asking = pending.find((h) => h.fromId === a.user.id);
              return (
                <li key={a.user.id} className="flex items-center gap-3 px-4 py-2.5">
                  <PlayerLink userId={a.user.id} className="shrink-0" aria-label={a.user.name}>
                    <Avatar name={a.user.name} photoId={a.user.photoId} shirtNumber={members.find((m) => m.userId === a.user.id)?.shirtNumber} size="sm" />
                  </PlayerLink>
                  <span className="min-w-0 flex-1 text-sm">
                    <PlayerLink userId={a.user.id} className="block truncate font-medium">
                      {a.user.name}
                      {a.user.id === user.id && <span className="font-normal text-slate-500"> (dig)</span>}
                    </PlayerLink>
                    {asking && (
                      <span className="block text-xs text-amber-700">
                        {asking.to ? `Venter på svar fra ${asking.to.name}` : "Søger en afløser i chatten"}
                      </span>
                    )}
                  </span>
                  {asking && asking.fromId === user.id && (
                    <ActionButton action={withdrawHandover} fields={{ id: asking.id }} label="Træk tilbage" variant="secondary" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {myRequest && <p className="mt-2 text-xs text-slate-500">Du har opgaven, indtil nogen siger ja.</p>}
      </section>

      {canGiveAway && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 [&>*]:flex-1">
            {canGiveAway && <GiveAwayDialog taskId={task.id} members={members.filter((m) => !task.assignees.some((a) => a.user.id === m.userId))} />}
          </div>
          {canGiveAway && <p className="text-xs text-slate-500">Kan du ikke? Giv den videre til holdet eller en bestemt.</p>}
        </div>
      )}

      {task.handovers.length > 0 && (
        <details className="group rounded-2xl border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium">
            Historik ({task.handovers.length})
            <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <ol className="divide-y divide-slate-100 border-t border-slate-100">
            {task.handovers.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    {h.from.name} → {h.inChat ? (h.to ? `${h.to.name} (via chatten)` : "chatten") : h.to?.name}
                  </span>
                  <Badge tone={HANDOVER_STATUS[h.status].tone}>{HANDOVER_STATUS[h.status].text}</Badge>
                </div>
                {h.note && <p className="text-slate-600">“{h.note}”</p>}
                <p className="text-xs text-slate-500">{readInZone(h.answeredAt ?? h.createdAt, "d. MMM 'kl.' HH:mm")}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <EditTaskDialog
            members={members}
            task={{
              id: task.id,
              title: task.title,
              description: task.description,
              dueOn:
                task.dueAt && (!task.match || task.dueAt.getTime() !== task.match.startsAt.getTime())
                  ? formatInZone(task.dueAt, "yyyy-MM-dd")
                  : "",
              hasMatch: task.match !== null,
              assigneeIds: task.assignees.map((a) => a.user.id),
            }}
          />
          <ActionButton
            action={deleteTask}
            fields={{ id: task.id }}
            label="Slet opgave"
            variant="danger"
            confirm="Slet opgaven?"
            confirmLabel="Slet opgaven"
          />
        </div>
      )}
    </div>
  );
}

/** A question put to the viewer about the job, with the buttons to answer it. */
function AnswerBox({
  name,
  userId,
  note,
  text,
  children,
}: {
  name: string;
  userId: string;
  note: string | null;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium">
        <PlayerLink userId={userId}>{name}</PlayerLink> {text}
      </p>
      {note && <p className="text-sm whitespace-pre-line text-slate-700">“{note}”</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
