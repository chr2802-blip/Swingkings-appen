import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import Image from "next/image";
import { fineBoard, monthKings } from "@/lib/fine-data";
import { movesFor } from "@/lib/challenges";
import { kr } from "@/lib/money";
import { OPEN_TASK } from "@/lib/tasks";
import { kickoffLabel, readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { NotificationSetup } from "@/components/notification-setup";
import { InstallCard } from "@/components/install-app";
import { TeamFeed } from "@/components/team-feed";
import { FineKing } from "@/components/crest";

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
  const topOwers = board.balances.filter((row) => row.owesKr > 0).slice(0, 3);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="stripes-wide relative overflow-hidden rounded-3xl border border-[var(--accent-line)] px-5 py-6 shadow-sm">
        <div className="relative z-10 max-w-[70%]">
          <h1 className="text-3xl">Hej {firstName} 👋</h1>
          <p className="mt-1 text-sm font-medium text-slate-700">Her er det vigtigste på {user.teamName}.</p>
        </div>
        <Image
          src="/logo.png"
          alt=""
          width={512}
          height={512}
          className="absolute top-1/2 -right-6 h-32 w-32 -translate-y-1/2 rotate-12 drop-shadow-md sm:right-6 sm:h-24 sm:w-24"
        />
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

      <Link href="/boder" className="press-card block rounded-2xl">
        <FineKing
          names={kings.userIds.map((id) => board.people.get(id)?.name.split(" ")[0] ?? "?")}
          amount={kr(kings.kr)}
          month={readInZone(new Date(), "MMMM")}
        />
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/boder" className="press-card block rounded-2xl">
          <Card className="h-full">
            <SectionTitle>Din bødekonto</SectionTitle>
            <p className={`text-3xl font-semibold ${mine && mine.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>
              {kr(Math.max(0, mine?.owesKr ?? 0))}
            </p>
            <p className="text-sm text-slate-500">{mine && mine.owesKr > 0 ? "skylder du til kassen" : "Du skylder ingenting"}</p>
            {topOwers.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Største gæld:{" "}
                {topOwers.map((row) => `${board.people.get(row.userId)?.name.split(" ")[0]} (${kr(row.owesKr)})`).join(", ")}
              </p>
            )}
          </Card>
        </Link>

        <Link href="/boder/udfordringer" className="press-card block rounded-2xl">
          <Card className="h-full">
            <SectionTitle>Udfordringer</SectionTitle>
            <p className="text-3xl font-semibold">{openChallenges.length}</p>
            <p className="text-sm text-slate-500">åbne udfordringer med dig</p>
            {waitingOnMe > 0 && (
              <p className="mt-3">
                <Badge tone="amber">{waitingOnMe} venter på dit svar</Badge>
              </p>
            )}
          </Card>
        </Link>
      </div>

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
