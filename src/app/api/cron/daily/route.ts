import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presentsCronSecret } from "@/lib/cron-secret";
import { sendPushToUsers } from "@/lib/push";
import { syncTeamCalendar } from "@/lib/kampklar";
import { OPEN_TASK, taskUrl } from "@/lib/tasks";
import { deadlineLabel, endOfDayInZone } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Calendars are read for this long after the reminders; each read can take up to 15 s on its own. */
const SYNC_BUDGET_MS = 30_000;

/**
 * The daily job, run by Vercel Cron each morning. It reads across every team on purpose,
 * which is why it uses `prisma` directly rather than `teamDb`.
 *
 * 1. Reminds each assignee of an open job due by tomorrow evening — once a day at most.
 * 2. Reads every team's KampKlar calendar (the one read longest ago first), so a moved or
 *    new match shows up without anybody pressing "Hent fra KampKlar".
 */
export async function GET(request: Request) {
  if (!presentsCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();

  const tomorrowEvening = endOfDayInZone(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const cutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const due = await prisma.task.findMany({
    where: {
      ...OPEN_TASK,
      dueAt: { lte: tomorrowEvening },
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: cutoff } }],
      assignees: { some: {} },
    },
    select: { id: true, title: true, dueAt: true, matchId: true, assignees: { select: { userId: true } } },
  });
  let sent = 0;
  for (const task of due) {
    sent += await sendPushToUsers(
      task.assignees.map((a) => a.userId),
      {
        title: `Husk: ${task.title}`,
        body: task.dueAt ? deadlineLabel(task.dueAt, now).text : "Opgaven venter på dig.",
        url: taskUrl(task),
        tag: `task-${task.id}`,
      },
    );
  }
  if (due.length) {
    await prisma.task.updateMany({ where: { id: { in: due.map((t) => t.id) } }, data: { lastNotifiedAt: now } });
  }
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
