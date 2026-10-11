import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presentsCronSecret } from "@/lib/cron-secret";
import { sendPushToUsers } from "@/lib/push";
import { syncTeamCalendar } from "@/lib/kampklar";
import { OPEN_TASK } from "@/lib/tasks";
import { deadlineLabel, endOfDayInZone } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily job, run by Vercel Cron each morning. It reads across every team on purpose,
 * which is why it uses `prisma` directly rather than `teamDb`.
 *
 * 1. Reads every team's KampKlar calendar, so a moved or new match shows up without
 *    anybody pressing "Hent fra KampKlar".
 * 2. Reminds each assignee of an open job due by tomorrow evening — once a day at most.
 */
export async function GET(request: Request) {
  if (!presentsCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();

  const teams = await prisma.team.findMany({ where: { calendarUrl: { not: null } }, select: { id: true } });
  const synced: Record<string, string> = {};
  for (const team of teams) {
    const result = await syncTeamCalendar(team.id, null).catch((error) => ({ ok: false as const, error: String(error) }));
    synced[team.id] = result.ok ? `+${result.created} ~${result.updated} x${result.cancelled}` : result.error;
  }

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
        url: task.matchId ? `/kampe/${task.matchId}` : `/opgaver/${task.id}`,
        tag: `task-${task.id}`,
      },
    );
  }
  if (due.length) {
    await prisma.task.updateMany({ where: { id: { in: due.map((t) => t.id) } }, data: { lastNotifiedAt: now } });
  }
  return NextResponse.json({ synced, tasksDue: due.length, notificationsSent: sent });
}
