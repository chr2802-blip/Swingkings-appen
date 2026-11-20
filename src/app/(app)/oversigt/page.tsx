import Link from "next/link";
import { clubOnScreen, requireTeamUser } from "@/lib/auth";
import { reachDb } from "@/lib/club-reach";
import { teamDb } from "@/lib/team-db";
import { canAdministerClub, canAdministerTeam } from "@/lib/access";
import { teamFeed } from "@/lib/feed";
import Image from "next/image";
import { fineBoard, monthKings } from "@/lib/fine-data";
import { waitsOn } from "@/lib/challenges";
import { kr } from "@/lib/money";
import { openTask } from "@/lib/tasks";
import { LISTED_ACTIVITY } from "@/lib/activity-data";
import { activityName } from "@/lib/activity";
import { countdown, greeting, readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { NotificationSetup } from "@/components/notification-setup";
import { InstallCard } from "@/components/install-app";
import { TeamFeed } from "@/components/team-feed";
import { LiveRefresh } from "@/components/live-refresh";
import { FEED_CHANGED, FINES_CHANGED } from "@/lib/realtime-topic";
import { Crown } from "@/components/crest";
import { HomeBanner } from "@/components/home-banner";
import { playerTasksHref } from "@/components/player-link";
import { FixtureCard } from "@/components/fixture-card";
import { clubLogos } from "@/lib/club-logos";

export default async function OverviewPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  // Activities, polls and posts: the team's own and the club's shared with it.
  const seen = reachDb(user.teamId);
  // The feed at the bottom is rendered only once all this is read; start its reads now, so
  // they run alongside instead of after (`TeamFeed` picks up the same request-cached call).
  void teamFeed(user.teamId, user.id, canAdministerTeam(user, user.teamId), canAdministerClub(user, clubOnScreen(user)));
  const [board, kings, nextMatch, nextFixture, myTaskCount, openChallenges, pollsWaiting, newPosts, handoversToMe] = await Promise.all([
    fineBoard(user.teamId),
    monthKings(user.teamId),
    seen.match.findFirst({
      where: { AND: [LISTED_ACTIVITY, { cancelledAt: null, startsAt: { gte: startOfDayInZone() } }] },
      orderBy: { startsAt: "asc" },
      select: { id: true, kind: true, title: true, opponent: true, startsAt: true, isHome: true },
    }),
    // The next match against somebody, for the poster under the tiles.
    db.match.findFirst({
      where: { ...LISTED_ACTIVITY, kind: "MATCH", opponent: { not: null }, cancelledAt: null, startsAt: { gte: startOfDayInZone() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, opponent: true, startsAt: true, isHome: true, location: true, note: true },
    }),
    db.task.count({ where: { ...openTask(), assignees: { some: { userId: user.id } } } }),
    db.challenge.findMany({ where: { status: "PENDING" }, select: { status: true, reportedById: true } }),
    seen.poll.count({
      where: {
        closedAt: null,
        OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
        ballots: { none: { userId: user.id } },
      },
    }),
    db.teamMember.findFirst({ where: { userId: user.id }, select: { feedSeenAt: true, createdAt: true } }).then((member) =>
      seen.post.count({
        where: { authorId: { not: user.id }, createdAt: { gt: member?.feedSeenAt ?? member?.createdAt ?? new Date() } },
      }),
    ),
    db.taskHandover.findMany({
      where: { toId: user.id, status: "PENDING", task: openTask() },
      orderBy: { createdAt: "asc" },
      select: { taskId: true },
    }),
  ]);
  // The poster is for match day only; any other day the next match is a tile like the rest.
  const matchday = nextFixture?.opponent && countdown(nextFixture.startsAt).matchday ? { ...nextFixture, opponent: nextFixture.opponent } : null;
  const opponentLogo = matchday ? (await clubLogos([matchday.opponent])).get(matchday.opponent) : null;
  const mine = board.balances.find((row) => row.userId === user.id);
  const waitingOnMe = openChallenges.filter((c) => waitsOn(c, user.id)).length;
  const owes = Math.max(0, mine?.owesKr ?? 0);
  const finesPaid = board.paid.has(user.id);
  const kingNames = kings.userIds.map((id) => board.people.get(id)?.name.split(" ")[0] ?? "?");
  const month = readInZone(new Date(), "MMMM");
  /**
   * The banner is one row of three tiles. The balance is always first; the other two are
   * the first of these that are waiting on this person (skipping zeros): tasks somebody
   * asks them to take over (the oldest first), polls without their vote, new posts,
   * challenges waiting on them, their open tasks. Free places go to the next activity,
   * then the month's bødekonge.
   */
  const waiting = [
    {
      kind: "count" as const,
      count: handoversToMe.length,
      href: `/opgaver/${handoversToMe[0]?.taskId}`,
      title: handoversToMe.length === 1 ? "Opgave tilbudt" : "Opgaver tilbudt",
      note: "venter på dit svar",
    },
    { kind: "count" as const, count: pollsWaiting, href: "#feed", title: pollsWaiting === 1 ? "Afstemning" : "Afstemninger", note: "mangler dit svar" },
    { kind: "count" as const, count: newPosts, href: "#feed", title: newPosts === 1 ? "Nyt opslag" : "Nye opslag", note: "i feedet" },
    { kind: "count" as const, count: waitingOnMe, href: "/boder/historik", title: waitingOnMe === 1 ? "Udfordring" : "Udfordringer", note: "venter på dig" },
  ].filter((tile) => tile.count > 0);
  type Tile = (typeof waiting)[number] | { kind: "tasks" } | { kind: "next" } | { kind: "king" };
  const tiles: Tile[] = [
    ...waiting,
    ...(myTaskCount > 0 ? [{ kind: "tasks" as const }] : []),
    // The poster below says the next match already; a tile for it would say it twice.
    ...(nextMatch && nextMatch.id === matchday?.id ? [] : [{ kind: "next" as const }]),
    { kind: "king" as const },
  ].slice(0, 2);
  /** Short enough for a third of a phone: "I dag", "I morgen", else the weekday and date. */
  const nextDay = nextMatch
    ? ["i dag", "i morgen"].includes(relativeDay(nextMatch.startsAt))
      ? relativeDay(nextMatch.startsAt)
      : readInZone(nextMatch.startsAt, "EEE d.")
    : null;
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <HomeBanner>
        <div className="mx-auto max-w-5xl pt-5 pr-[max(1rem,env(safe-area-inset-right))] pb-6 pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center justify-between gap-3 sm:max-w-xl">
            <h1 className="truncate text-2xl">{greeting(firstName, { matchday: Boolean(matchday) })}</h1>
            <Image src="/logo.png" alt="" width={512} height={512} className="h-12 w-12 shrink-0 rotate-12 drop-shadow-md" />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--accent-line)] bg-slate-100 shadow-sm sm:max-w-xl">
            <Link href="/boder" className="press-card min-w-0 bg-white px-3 py-3">
              <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Bødekonto</p>
              <p className={`font-score text-3xl leading-tight font-semibold ${owes > 0 && !finesPaid ? "text-[var(--star)]" : "text-emerald-700"}`}>{kr(owes)}</p>
              <p className="truncate text-xs text-slate-500">
                {finesPaid ? "betalt – tak!" : owes === 0 ? "ren tavle" : board.paymentOpenedAt ? "skal betales nu" : "i bøder"}
              </p>
            </Link>
            {tiles.map((tile) =>
              tile.kind === "next" ? (
                <Link key="next" href={nextMatch ? `/aktiviteter/${nextMatch.id}` : "/aktiviteter"} className="press-card min-w-0 bg-white px-3 py-3">
                  <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    {nextMatch?.kind === "MATCH" ? "Næste kamp" : "Næste aktivitet"}
                  </p>
                  <p className="font-score truncate text-3xl leading-tight font-semibold text-[var(--accent-text)]">
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
                <Link key="tasks" href={playerTasksHref(user.id)} className="press-card min-w-0 bg-white px-3 py-3">
                  <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    {myTaskCount === 1 ? "Opgave" : "Opgaver"}
                  </p>
                  <p className={`font-score text-3xl leading-tight font-semibold ${myTaskCount > 0 ? "text-amber-600" : "text-emerald-700"}`}>{myTaskCount}</p>
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
                  <p className="font-display truncate text-lg leading-[2.25rem]">{kingNames.length > 0 ? kingNames.join(" & ") : "Ledig"}</p>
                  <p className="truncate text-xs text-slate-500">{kingNames.length > 0 ? `${kr(kings.kr)} i ${month}` : `ingen bøder i ${month}`}</p>
                </Link>
              ) : (
                <Link key={tile.title} href={tile.href} className="press-card min-w-0 bg-white px-3 py-3">
                  <p className="truncate text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{tile.title}</p>
                  <p className="font-score text-3xl leading-tight font-semibold text-amber-600">{tile.count}</p>
                  <p className="truncate text-xs text-slate-500">{tile.note}</p>
                </Link>
              ),
            )}
          </div>

          {matchday && (
            <div className="mt-3 sm:max-w-xl">
              <FixtureCard match={matchday} teamName={user.teamName} opponentLogo={opponentLogo} />
            </div>
          )}
        </div>
      </HomeBanner>

      <InstallCard />
      <NotificationSetup compact />

      {/* No Suspense boundary round it: see tests/unit/no-suspense.test.ts. */}
      <TeamFeed user={user} />
      {/* The feed and the fine box's board above read themselves again when a teammate changes them. */}
      <LiveRefresh events={[FEED_CHANGED, FINES_CHANGED]} />
    </div>
  );
}
