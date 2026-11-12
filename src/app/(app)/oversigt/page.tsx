import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import Image from "next/image";
import { fineBoard, monthKings } from "@/lib/fine-data";
import { movesFor } from "@/lib/challenges";
import { kr } from "@/lib/money";
import { OPEN_TASK } from "@/lib/tasks";
import { LISTED_ACTIVITY } from "@/lib/activity-data";
import { activityName } from "@/lib/activity";
import { kickoffLabel, readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { Card, SectionTitle } from "@/components/ui";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { NotificationSetup } from "@/components/notification-setup";
import { InstallCard } from "@/components/install-app";
import { TeamFeed } from "@/components/team-feed";
import { Crown } from "@/components/crest";
import { HomeBanner } from "@/components/home-banner";

export default async function OverviewPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const [board, kings, nextMatch, myTasks, myTaskCount, openChallenges, pollsWaiting, newPosts] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    db.match.findFirst({
      where: { ...LISTED_ACTIVITY, cancelledAt: null, startsAt: { gte: startOfDayInZone() } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        kind: true,
        title: true,
        opponent: true,
        startsAt: true,
        location: true,
        isHome: true,
        tasks: { select: TASK_SELECT },
      },
    }),
    db.task.findMany({
      where: { ...OPEN_TASK, assignees: { some: { userId: user.id } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 5,
      select: TASK_SELECT,
    }),
    db.task.count({ where: { ...OPEN_TASK, assignees: { some: { userId: user.id } } } }),
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
    db.teamMember.findFirst({ where: { userId: user.id }, select: { feedSeenAt: true, createdAt: true } }).then((member) =>
      db.post.count({
        where: { authorId: { not: user.id }, createdAt: { gt: member?.feedSeenAt ?? member?.createdAt ?? new Date() } },
      }),
    ),
  ]);
  const mine = board.balances.find((row) => row.userId === user.id);
  const waitingOnMe = openChallenges.filter((c) => movesFor(c, user.id, false).some((m) => m !== "cancel")).length;
  const owes = Math.max(0, mine?.owesKr ?? 0);
  const kingNames = kings.userIds.map((id) => board.people.get(id)?.name.split(" ")[0] ?? "?");
  const month = readInZone(new Date(), "MMMM");
  /**
   * The banner holds three tiles side by side: the balance always, then the two most
   * pressing things waiting on this person (in this order, skipping those at zero), and
   * the month's bødekonge filling a free place.
   */
  const waiting = [
    { kind: "count" as const, count: pollsWaiting, href: "#feed", title: pollsWaiting === 1 ? "Afstemning" : "Afstemninger", note: "mangler dit svar" },
    { kind: "count" as const, count: newPosts, href: "#feed", title: newPosts === 1 ? "Nyt opslag" : "Nye opslag", note: "i feedet" },
    { kind: "count" as const, count: waitingOnMe, href: "/boder/udfordringer", title: waitingOnMe === 1 ? "Udfordring" : "Udfordringer", note: "venter på dig" },
    { kind: "count" as const, count: myTaskCount, href: "/opgaver", title: myTaskCount === 1 ? "Opgave" : "Opgaver", note: "til dig" },
  ].filter((tile) => tile.count > 0);
  const tiles: (typeof waiting[number] | { kind: "king" })[] = waiting.slice(0, 2);
  if (tiles.length < 2) tiles.push({ kind: "king" });
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <HomeBanner>
        <div className="mx-auto max-w-5xl pt-5 pr-[max(1rem,env(safe-area-inset-right))] pb-6 pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center justify-between gap-3 sm:max-w-xl">
            <h1 className="truncate text-2xl">Hej {firstName} 👋</h1>
            <Image src="/logo.png" alt="" width={512} height={512} className="h-12 w-12 shrink-0 rotate-12 drop-shadow-md" />
          </div>

          <div
            className={`mt-3 grid divide-x divide-slate-100 overflow-hidden rounded-2xl border border-[var(--accent-line)] bg-white shadow-sm sm:max-w-xl ${
              tiles.length === 2 ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <Link href="/boder" className="press-card min-w-0 px-3 py-3">
              <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Bødekonto</p>
              <p className={`text-2xl leading-tight font-semibold ${owes > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(owes)}</p>
              <p className="truncate text-xs text-slate-500">{owes > 0 ? "skylder du" : "intet at betale"}</p>
            </Link>
            {tiles.map((tile) =>
              tile.kind === "king" ? (
                <Link key="king" href="/boder" className="press-card min-w-0 bg-[var(--gold-tint)] px-3 py-3">
                  <p className="flex items-center gap-1 truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <Crown className="h-3.5 w-3.5" />
                    Bødekonge
                  </p>
                  <p className="font-display truncate text-2xl leading-tight">{kingNames.length > 0 ? kingNames.join(" & ") : "Ledig"}</p>
                  <p className="truncate text-xs text-slate-500">{kingNames.length > 0 ? `${kr(kings.kr)} i ${month}` : `ingen bøder i ${month}`}</p>
                </Link>
              ) : (
                <Link key={tile.title} href={tile.href} className="press-card min-w-0 px-3 py-3">
                  <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{tile.title}</p>
                  <p className="text-2xl leading-tight font-semibold text-amber-600">{tile.count}</p>
                  <p className="truncate text-xs text-slate-500">{tile.note}</p>
                </Link>
              ),
            )}
          </div>
        </div>
      </HomeBanner>

      <InstallCard />
      <NotificationSetup compact />

      <section>
        <SectionTitle
          action={
            <Link href="/aktiviteter" className="text-sm text-[var(--accent-text)] underline">
              Alle aktiviteter
            </Link>
          }
        >
          Næste aktivitet
        </SectionTitle>
        {nextMatch ? (
          <Card padded={false}>
            <Link href={`/aktiviteter/${nextMatch.id}`} className="press-card block px-5 py-4">
              <p className="font-display text-xl">
                {nextMatch.kind === "MATCH" && nextMatch.opponent
                  ? `${nextMatch.isHome === false ? "Ude mod" : nextMatch.isHome ? "Hjemme mod" : "Mod"} ${nextMatch.opponent}`
                  : activityName(nextMatch)}
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
          <Card className="text-sm text-slate-500">Ingen kommende aktiviteter i kalenderen.</Card>
        )}
      </section>

      <section>
        <SectionTitle>Dine opgaver</SectionTitle>
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
