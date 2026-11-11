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
import { HomeBanner } from "@/components/home-banner";

export default async function OverviewPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const [board, kings, nextMatch, myTasks, myTaskCount, openChallenges, pollsWaiting, newPosts] = await Promise.all([
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
  /** What is waiting on this person, most pressing first; rows at zero are left out. */
  const waiting = [
    { icon: "🗳️", count: pollsWaiting, href: "#feed", label: pollsWaiting === 1 ? "Afstemning mangler dit svar" : "Afstemninger mangler dit svar" },
    { icon: "📣", count: newPosts, href: "#feed", label: newPosts === 1 ? "Nyt opslag" : "Nye opslag" },
    { icon: "⚔️", count: waitingOnMe, href: "/boder/udfordringer", label: waitingOnMe === 1 ? "Udfordring venter på dig" : "Udfordringer venter på dig" },
    { icon: "✅", count: myTaskCount, href: "/opgaver", label: myTaskCount === 1 ? "Opgave til dig" : "Opgaver til dig" },
  ].filter((row) => row.count > 0);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <HomeBanner>
        <div className="mx-auto max-w-5xl pt-5 pr-[max(1rem,env(safe-area-inset-right))] pb-6 pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center justify-between gap-3 sm:max-w-xl">
            <h1 className="truncate text-2xl">Hej {firstName} 👋</h1>
            <Image src="/logo.png" alt="" width={512} height={512} className="h-12 w-12 shrink-0 rotate-12 drop-shadow-md" />
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--accent-line)] bg-white shadow-sm sm:max-w-xl">
            <Link href="/boder" className="press-card flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Din bødekonto</p>
                <p className={`text-3xl leading-tight font-semibold ${owes > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(owes)}</p>
                <p className="text-xs text-slate-500">{owes > 0 ? "skylder du til kassen" : "Du skylder ingenting"}</p>
              </div>
              <span aria-hidden className="text-slate-400">
                →
              </span>
            </Link>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {waiting.length === 0 ? (
                <li className="px-4 py-2.5 text-sm text-slate-500">Intet venter på dig ✨</li>
              ) : (
                waiting.map((row) => (
                  <li key={row.label}>
                    <Link href={row.href} className="press-card flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span aria-hidden className="w-5 text-center text-base">
                        {row.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{row.count}</span>
                      <span aria-hidden className="text-slate-400">
                        →
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>

          <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--gold)] bg-[var(--gold-tint)] px-3 py-1 text-xs">
            <Crown className="h-4 w-4" />
            <span className="truncate">
              {kingNames.length > 0 ? (
                <>
                  Månedens bødekonge: <b className="font-semibold">{kingNames.join(" & ")}</b> · {kr(kings.kr)}
                </>
              ) : (
                `Ingen bødekonge i ${month} endnu`
              )}
            </span>
          </p>
        </div>
      </HomeBanner>

      <InstallCard />
      <NotificationSetup compact />

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
