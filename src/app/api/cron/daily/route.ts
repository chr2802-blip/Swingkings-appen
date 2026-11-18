import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presentsCronSecret } from "@/lib/cron-secret";
import { clearOldNotifications, pushNotifications, recordNotifications } from "@/lib/notifications";
import { syncTeamCalendar } from "@/lib/kampklar";
import { clearOldPushPauses } from "@/lib/grouped-push";
import { openTask, taskUrl } from "@/lib/tasks";
import { deadlineLabel, endOfDayInZone } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Calendars are read for this long after the reminders; each read can take up to 15 s on its own. */
const SYNC_BUDGET_MS = 30_000;

/**
 * The daily job, run by Vercel Cron each morning. It reads across every team on purpose,
 * which is why it uses `prisma` directly rather than `teamDb`.
 *
 * 1. Reminds each assignee of an open job due by tomorrow evening — once a day at most,
 *    in the notification center and, unless they muted reminders, by push.
 * 2. Forgets the chat and comment push pauses that are long over, and the notifications
 *    older than `KEEP_DAYS`.
 * 3. Reads every team's KampKlar calendar (the one read longest ago first), so a moved or
 *    new match shows up without anybody pressing "Hent fra KampKlar".
 */
export async function GET(request: Request) {
  if (!presentsCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();

  const tomorrowEvening = endOfDayInZone(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const cutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const due = await prisma.task.findMany({
    where: {
      ...openTask(now),
      dueAt: { lte: tomorrowEvening },
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: cutoff } }],
      assignees: { some: {} },
    },
    select: { id: true, teamId: true, title: true, dueAt: true, matchId: true, assignees: { select: { userId: true } } },
  });
  let sent = 0;
  for (const task of due) {
    const recorded = await recordNotifications(
      task.teamId,
      null,
      task.assignees.map((a) => ({
        userId: a.userId,
        category: "REMINDERS" as const,
        title: `Husk: ${task.title}`,
        body: task.dueAt ? deadlineLabel(task.dueAt, now).text : "Opgaven venter på dig.",
        url: taskUrl(task),
        tag: `task-${task.id}`,
        taskId: task.id,
      })),
    );
    sent += await pushNotifications(recorded);
  }
  if (due.length) {
    await prisma.task.updateMany({ where: { id: { in: due.map((t) => t.id) } }, data: { lastNotifiedAt: now } });
  }
  await clearOldPushPauses(now);
  await clearOldNotifications(now);
  // The reminders are what people notice, so they go first; the calendars use what is left
  // of the time, and a team not reached today is reached tomorrow.
  const started = Date.now();
  const teams = await prisma.team.findMany({
    where: { calendarUrl: { not: null } },
    select: { id: true },
    orderBy: { calendarSyncedAt: { sort: "asc", nulls: "first" } },
  });
  const synced: Record<string, string> = {};
  for (const team of teams) {
    if (Date.now() - started > SYNC_BUDGET_MS) {
      synced[team.id] = "skipped: out of time";
      continue;
    }
    const result = await syncTeamCalendar(team.id, null).catch((error) => ({ ok: false as const, error: String(error) }));
    synced[team.id] = result.ok ? `+${result.created} ~${result.updated} x${result.cancelled}` : result.error;
  }

  return NextResponse.json({ synced, tasksDue: due.length, notificationsSent: sent });
}
