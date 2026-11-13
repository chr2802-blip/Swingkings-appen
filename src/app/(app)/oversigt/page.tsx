import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import Image from "next/image";
import { fineBoard, monthKings } from "@/lib/fine-data";
import { waitsOn } from "@/lib/challenges";
import { kr } from "@/lib/money";
import { OPEN_TASK } from "@/lib/tasks";
import { LISTED_ACTIVITY } from "@/lib/activity-data";
import { activityName } from "@/lib/activity";
import { readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { NotificationSetup } from "@/components/notification-setup";
import { InstallCard } from "@/components/install-app";
import { TeamFeed } from "@/components/team-feed";
import { Crown } from "@/components/crest";
import { HomeBanner } from "@/components/home-banner";

export default async function OverviewPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const [board, kings, nextMatch, firstTask, myTaskCount, openChallenges, pollsWaiting, newPosts] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    db.match.findFirst({
      where: { ...LISTED_ACTIVITY, cancelledAt: null, startsAt: { gte: startOfDayInZone() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, kind: true, title: true, opponent: true, startsAt: true, isHome: true },
    }),
    db.task.findFirst({
      where: { ...OPEN_TASK, assignees: { some: { userId: user.id } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      select: { matchId: true },
    }),
    db.task.count({ where: { ...OPEN_TASK, assignees: { some: { userId: user.id } } } }),
    db.challenge.findMany({ where: { status: "PENDING" }, select: { status: true, reportedById: true } }),
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
  const waitingOnMe = openChallenges.filter((c) => waitsOn(c, user.id)).length;
  const owes = Math.max(0, mine?.owesKr ?? 0);
  const kingNames = kings.userIds.map((id) => board.people.get(id)?.name.split(" ")[0] ?? "?");
  const month = readInZone(new Date(), "MMMM");
  /**
   * The banner is one row of three tiles. The balance is always first; the other two are
   * the first of these that are waiting on this person (skipping zeros): polls without
   * their vote, new posts, challenges waiting on them, their open tasks. Free places go to
   * the next activity, then the month's bødekonge.
   */
  const waiting = [
    { kind: "count" as const, count: pollsWaiting, href: "#feed", title: pollsWaiting === 1 ? "Afstemning" : "Afstemninger", note: "mangler dit svar" },
    { kind: "count" as const, count: newPosts, href: "#feed", title: newPosts === 1 ? "Nyt opslag" : "Nye opslag", note: "i feedet" },
    { kind: "count" as const, count: waitingOnMe, href: "/boder?udfordringer", title: waitingOnMe === 1 ? "Udfordring" : "Udfordringer", note: "venter på dig" },
  ].filter((tile) => tile.count > 0);
  type Tile = (typeof waiting)[number] | { kind: "tasks" } | { kind: "next" } | { kind: "king" };
  const tiles: Tile[] = [
    ...waiting,
    ...(myTaskCount > 0 ? [{ kind: "tasks" as const }] : []),
    { kind: "next" as const },
    { kind: "king" as const },
  ].slice(0, 2);
  /** Short enough for a third of a phone: "I dag", "I morgen", else the weekday and date. */
  const nextDay = nextMatch
    ? ["i dag", "i morgen"].includes(relativeDay(nextMatch.startsAt))
      ? relativeDay(nextMatch.startsAt)
      : readInZone(nextMatch.startsAt, "EEE d.")
    : null;
  const tasksHref = firstTask?.matchId ? `/aktiviteter/${firstTask.matchId}` : "/aktiviteter";
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <HomeBanner>
        <div className="mx-auto max-w-5xl pt-5 pr-[max(1rem,env(safe-area-inset-right))] pb-6 pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center justify-between gap-3 sm:max-w-xl">
            <h1 className="truncate text-2xl">Hej {firstName} 👋</h1>
            <Image src="/logo.png" alt="" width={512} height={512} className="h-12 w-12 shrink-0 rotate-12 drop-shadow-md" />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--accent-line)] bg-slate-100 shadow-sm sm:max-w-xl">
            <Link href="/boder" className="press-card min-w-0 bg-white px-3 py-3">
              <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Bødekonto</p>
              <p className={`text-2xl leading-tight font-semibold ${owes > 0 ? "text-red-600" : "text-emerald-700"}`}>{kr(owes)}</p>
              <p className="truncate text-xs text-slate-500">{owes > 0 ? "udestående" : "ren tavle"}</p>
            </Link>
            {tiles.map((tile) =>
              tile.kind === "next" ? (
                <Link key="next" href={nextMatch ? `/aktiviteter/${nextMatch.id}` : "/aktiviteter"} className="press-card min-w-0 bg-white px-3 py-3">
                  <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    {nextMatch?.kind === "MATCH" ? "Næste kamp" : "Næste aktivitet"}
                  </p>
                  <p className="truncate text-2xl leading-tight font-semibold text-[var(--accent-text)]">
                    {nextDay ? nextDay.charAt(0).toUpperCase() + nextDay.slice(1) : "Ingen"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {nextMatch
                      ? `${readInZone(nextMatch.startsAt, "HH:mm")} · ${
                          nextMatch.kind === "MATCH" && nextMatch.opponent
                            ? `${nextMatch.isHome === false ? "ude mod" : nextMatch.isHome ? "hjemme mod" : "mod"} ${nextMatch.opponent}`
                            : activityName(nextMatch)
                        }`
                      : "i kalenderen"}
                  </p>
                </Link>
              ) : tile.kind === "tasks" ? (
                <Link key="tasks" href={tasksHref} className="press-card min-w-0 bg-white px-3 py-3">
                  <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    {myTaskCount === 1 ? "Opgave" : "Opgaver"}
                  </p>
                  <p className={`text-2xl leading-tight font-semibold ${myTaskCount > 0 ? "text-amber-600" : "text-emerald-700"}`}>{myTaskCount}</p>
                  <p className="truncate text-xs text-slate-500">{myTaskCount > 0 ? "til dig" : "ingen lige nu"}</p>
                </Link>
              ) : tile.kind === "king" ? (
                <Link key="king" href="/boder" className="press-card min-w-0 bg-[var(--gold-tint)] px-3 py-3">
                  <p className="flex items-center gap-1 truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <Crown className="h-3.5 w-3.5" />
                    Bødekonge
                  </p>
                  {/* Smaller than the other tiles' figures, so a name fits a third of a phone; the
                      line height keeps the tile as tall as its neighbours. */}
                  <p className="font-display truncate text-lg leading-[1.875rem]">{kingNames.length > 0 ? kingNames.join(" & ") : "Ledig"}</p>
                  <p className="truncate text-xs text-slate-500">{kingNames.length > 0 ? `${kr(kings.kr)} i ${month}` : `ingen bøder i ${month}`}</p>
                </Link>
              ) : (
                <Link key={tile.title} href={tile.href} className="press-card min-w-0 bg-white px-3 py-3">
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

      {/* No Suspense boundary round it: see tests/unit/no-suspense.test.ts. */}
      <TeamFeed user={user} />
    </div>
  );
}
