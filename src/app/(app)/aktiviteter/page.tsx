import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { reachDb } from "@/lib/club-reach";
import { prisma } from "@/lib/prisma";
import { readInZone, startOfDayInZone } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { ActivityDialog } from "@/components/activity-dialog";
import { CalendarButton } from "@/components/calendar-button";
import { calendarPathFor } from "@/lib/calendar-feed";
import { AutoSync } from "@/components/auto-sync";
import { CreateAction } from "@/components/create-button";
import { copyableActivities, templateOptions } from "@/lib/activity-data";
import { activityName, signupCounts } from "@/lib/activity";

/** How many activities are read each way from today. */
const EACH_WAY = 60;

const ROW = {
  id: true,
  title: true,
  opponent: true,
  kind: true,
  startsAt: true,
  location: true,
  isHome: true,
  cancelledAt: true,
  source: true,
  externalSignups: true,
  signups: { select: { going: true } },
  club: { select: { name: true } },
} satisfies Prisma.MatchSelect;

type Row = Prisma.MatchGetPayload<{ select: typeof ROW }>;

/**
 * Every activity — matches, trainings and the rest, and the club's activities shared with
 * the team (named with the club) — in one list in the order they are played, from today. The earlier ones are folded away under "Vis tidligere", newest first.
 * Each row says one thing on its right: that it is cancelled, or in a green circle how many
 * have signed up — for a hand-made activity also a red one for those who said no.
 */
export default async function ActivitiesPage() {
  const user = await requireTeamUser();
  const admin = canAdministerTeam(user, user.teamId);
  const today = startOfDayInZone();
  // The team's own activities and the club activities shared with it.
  const seen = reachDb(user.teamId);

  const [team, upcoming, earlier, templates, copyable, feedPath] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { calendarUrl: true } }),
    seen.match.findMany({ where: { startsAt: { gte: today } }, orderBy: { startsAt: "asc" }, take: EACH_WAY, select: ROW }),
    seen.match.findMany({ where: { startsAt: { lt: today } }, orderBy: { startsAt: "desc" }, take: EACH_WAY, select: ROW }),
    templateOptions(user.teamId),
    copyableActivities(user.teamId),
    calendarPathFor(user.id, user.teamId),
  ]);

  return (
    <div>
      <PageHeader title="Aktiviteter" action={<CalendarButton path={feedPath} />} />
      {team.calendarUrl && <AutoSync />}
      {!team.calendarUrl && admin && (
        <Link href="/hold" className="-mt-4 mb-6 block text-sm font-medium text-[var(--accent-text)]">
          Hent kampene fra KampKlar ›
        </Link>
      )}
      <CreateAction>
        <ActivityDialog templates={templates} copyable={copyable} />
      </CreateAction>
      {upcoming.length === 0 ? (
        <EmptyState icon="📅">Ingen kommende aktiviteter i kalenderen. Banen hviler.</EmptyState>
      ) : (
        <ActivityMonths rows={upcoming} />
      )}
      {earlier.length > 0 && (
        <details className="group mt-8">
          <summary className="press-card cursor-pointer list-none rounded-xl py-2 text-center text-sm font-medium text-[var(--accent-text)] group-open:hidden">
            Vis tidligere
          </summary>
          <section aria-label="Tidligere aktiviteter" className="opacity-75">
            <ActivityMonths rows={earlier} />
          </section>
        </details>
      )}
    </div>
  );
}

function ActivityMonths({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-6">
      {groupByMonth(rows).map(([month, inMonth]) => (
        <section key={month}>
          <SectionTitle>{month}</SectionTitle>
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {inMonth.map((match) => (
                <li key={match.id}>
                  <Link href={`/aktiviteter/${match.id}`} className="press-card flex items-center gap-3 px-4 py-3">
                    <div className="accent-tint-bg flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-[var(--accent-text)]">
                      <span className="text-[10px] font-semibold uppercase">{readInZone(match.startsAt, "EEE")}</span>
                      <span className="text-lg leading-none font-bold">{readInZone(match.startsAt, "d")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${match.cancelledAt ? "text-slate-400 line-through" : ""}`}>
                        {activityName(match)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {match.club && <span className="font-semibold text-slate-600">{match.club.name} · </span>}
                        {readInZone(match.startsAt, "HH:mm")}
                        {match.kind === "MATCH" && match.isHome !== null && ` · ${match.isHome ? "Hjemme" : "Ude"}`}
                        {match.location && ` · ${match.location}`}
                      </p>
                    </div>
                    {match.cancelledAt ? <Badge tone="red">Aflyst</Badge> : <SignupCircles match={match} />}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

/** A number in a coloured circle, with its word for a screen reader. */
function Circle({ count, word, tone }: { count: number; word: string; tone: string }) {
  return (
    <span title={word} className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${tone}`}>
      {count}
      <span className="sr-only"> {word}</span>
    </span>
  );
}

/** Green: signed up. Red, for a hand-made activity: said no. A circle with nothing in it is left out. */
function SignupCircles({ match }: { match: Row }) {
  const counts = signupCounts(match);
  if (!counts || (counts.going === 0 && !counts.notGoing)) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {counts.going > 0 && <Circle count={counts.going} word="tilmeldt" tone="bg-emerald-600" />}
      {!!counts.notGoing && <Circle count={counts.notGoing} word="kommer ikke" tone="bg-red-500" />}
    </span>
  );
}

function groupByMonth<T extends { startsAt: Date }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = readInZone(row.startsAt, "MMMM yyyy");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}
