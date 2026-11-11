import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import Image from "next/image";
import { fineBoard, monthKings } from "@/lib/fine-data";
import { movesFor } from "@/lib/challenges";
import { kr } from "@/lib/money";
import { OPEN_TASK } from "@/lib/tasks";
import { kickoffLabel, readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { Card, SectionTitle } from "@/components/ui";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { NotificationSetup } from "@/components/notification-setup";
import { InstallCard } from "@/components/install-app";
import { TeamFeed } from "@/components/team-feed";
import { Crown } from "@/components/crest";

export default async function OverviewPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const [board, kings, nextMatch, myTasks, openChallenges, pollsWaiting] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    db.match.findFirst({
      where: { kind: "MATCH", cancelledAt: null, startsAt: { gte: startOfDayInZone() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, opponent: true, startsAt: true, location: true, isHome: true, tasks: { select: TASK_SELECT } },
    }),
    db.task.findMany({
      where: { ...OPEN_TASK, assignees: { some: { userId: user.id } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 5,
      select: TASK_SELECT,
    }),
    db.challenge.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] }, OR: [{ challengerId: user.id }, { opponentId: user.id }] },
      select: { status: true, challengerId: true, opponentId: true, claimedById: true, claimedWinnerId: true },
    }),
    db.poll.count({
      where: {
        closedAt: null,
        OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
        ballots: { none: { userId: user.id } },
      },
    }),
  ]);
  const mine = board.balances.find((row) => row.userId === user.id);
  const waitingOnMe = openChallenges.filter((c) => movesFor(c, user.id, false).some((m) => m !== "cancel")).length;
  const owes = Math.max(0, mine?.owesKr ?? 0);
  const kingNames = kings.userIds.map((id) => board.people.get(id)?.name.split(" ")[0] ?? "?");
  const month = readInZone(new Date(), "MMMM");
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-3xl border border-[var(--accent-line)] bg-white shadow-sm">
        <div className="stripes-wide flex items-center justify-between gap-3 px-5 py-4">
          <h1 className="truncate text-2xl">Hej {firstName} 👋</h1>
          <Image src="/logo.png" alt="" width={512} height={512} className="h-14 w-14 shrink-0 rotate-12 drop-shadow-md" />
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-[var(--accent-line)]">
          <Link href="/boder" className="press-card min-w-0 px-3 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Bødekonto</p>
            <p className={`text-xl font-semibold ${owes > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(owes)}</p>
            <p className="truncate text-xs text-slate-500">{owes > 0 ? "skylder du" : "intet at betale"}</p>
          </Link>
          <Link href="/boder/udfordringer" className="press-card min-w-0 px-3 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Udfordringer</p>
            <p className="text-xl font-semibold">{openChallenges.length}</p>
            <p className={`truncate text-xs ${waitingOnMe > 0 ? "font-medium text-amber-700" : "text-slate-500"}`}>
              {waitingOnMe > 0 ? `${waitingOnMe} venter på dig` : "åbne med dig"}
            </p>
          </Link>
          <Link href="/boder" className="press-card min-w-0 bg-[var(--gold-tint)] px-3 py-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              <Crown className="h-3.5 w-3.5" />
              Bødekonge
            </p>
            {kingNames.length > 0 ? (
              <>
                <p className="font-display truncate text-xl">{kingNames.join(" & ")}</p>
                <p className="truncate text-xs text-slate-500">
                  {kr(kings.kr)} i {month}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl">Ledig</p>
                <p className="truncate text-xs text-slate-500">ingen bøder i {month}</p>
              </>
            )}
          </Link>
        </div>
      </div>

      <InstallCard />
      <NotificationSetup compact />

      {pollsWaiting > 0 && (
        <Link
          href="#feed"
          className="press-card flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span aria-hidden className="text-xl">
            🗳️
          </span>
          <span className="flex-1">
            {pollsWaiting === 1 ? "1 afstemning venter på din stemme" : `${pollsWaiting} afstemninger venter på din stemme`}
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <section>
        <SectionTitle action={<Link href="/kampe" className="text-sm text-[var(--accent-text)] underline">Alle kampe</Link>}>
          Næste kamp
        </SectionTitle>
        {nextMatch ? (
          <Card padded={false}>
            <Link href={`/kampe/${nextMatch.id}`} className="press-card block px-5 py-4">
              <p className="font-display text-xl">
                {nextMatch.opponent ? `${nextMatch.isHome === false ? "Ude mod" : nextMatch.isHome ? "Hjemme mod" : "Mod"} ${nextMatch.opponent}` : nextMatch.title}
              </p>
              <p className="text-sm text-slate-500">
                {kickoffLabel(nextMatch.startsAt)} · {relativeDay(nextMatch.startsAt)}
                {nextMatch.location && ` · ${nextMatch.location}`}
              </p>
            </Link>
            {nextMatch.tasks.length > 0 && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {nextMatch.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} viewerId={user.id} showMatch={false} />
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card className="text-sm text-slate-500">Ingen kommende kampe i kalenderen.</Card>
        )}
      </section>

      <section>
        <SectionTitle action={<Link href="/opgaver" className="text-sm text-[var(--accent-text)] underline">Alle opgaver</Link>}>
          Dine opgaver
        </SectionTitle>
        {myTasks.length === 0 ? (
          <Card className="text-sm text-slate-500">Du har ingen opgaver lige nu 🎉</Card>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {myTasks.map((task) => (
                <TaskRow key={task.id} task={task} viewerId={user.id} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <TeamFeed user={user} />
    </div>
  );
}
