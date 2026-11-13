import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { StartHere } from "@/components/start-here";
import { ActivityDialog } from "@/components/activity-dialog";
import { SyncButton } from "@/components/sync-button";
import { CreateAction } from "@/components/create-button";
import { copyableActivities, templateOptions } from "@/lib/activity-data";
import { activityName } from "@/lib/activity";

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
  tasks: { where: { doneAt: null }, select: { id: true } },
  _count: { select: { signups: { where: { going: true } } } },
} satisfies Prisma.MatchSelect;

type Row = Prisma.MatchGetPayload<{ select: typeof ROW }>;

/**
 * Every activity — matches, trainings and the rest — in one list in the order they are
 * played. The page opens at today (`StartHere`); the earlier ones lie above it, so they
 * are read by scrolling back up.
 */
export default async function ActivitiesPage() {
  const user = await requireTeamUser();
  const admin = canAdministerTeam(user, user.teamId);
  const today = startOfDayInZone();
  const db = teamDb(user.teamId);

  const [team, upcoming, latest, templates, copyable] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { calendarUrl: true, calendarSyncedAt: true } }),
    db.match.findMany({ where: { startsAt: { gte: today } }, orderBy: { startsAt: "asc" }, take: EACH_WAY, select: ROW }),
    db.match.findMany({ where: { startsAt: { lt: today } }, orderBy: { startsAt: "desc" }, take: EACH_WAY, select: ROW }),
    templateOptions(user.teamId),
    copyableActivities(user.teamId),
  ]);
  const earlier = latest.reverse();

  return (
    <div>
      {earlier.length > 0 && (
        <section aria-label="Tidligere aktiviteter" className="mb-8 opacity-75">
          <ActivityMonths rows={earlier} />
        </section>
      )}
      {/* As tall as the screen, so today can reach the top however little lies ahead. */}
      <StartHere active={earlier.length > 0} className={`scroll-mt-20 ${earlier.length > 0 ? "min-h-dvh" : ""}`}>
        <PageHeader
          title="Aktiviteter"
          description={
            team.calendarUrl
              ? `Hentes fra DBU KampKlar${team.calendarSyncedAt ? ` · senest ${readInZone(team.calendarSyncedAt, "d. MMM 'kl.' HH:mm")}` : ""}`
              : admin
                ? "Indsæt holdets kalenderlink fra KampKlar under Holdindstillinger, så kommer kampene automatisk."
                : undefined
          }
          action={team.calendarUrl && <SyncButton />}
        />
        <CreateAction>
          <ActivityDialog templates={templates} copyable={copyable} />
        </CreateAction>
        {upcoming.length === 0 ? (
          <EmptyState icon="📅">Ingen kommende aktiviteter i kalenderen.</EmptyState>
        ) : (
          <ActivityMonths rows={upcoming} />
        )}
      </StartHere>
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
                        {readInZone(match.startsAt, "HH:mm")} · {relativeDay(match.startsAt)}
                        {match.location && ` · ${match.location}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {match.cancelledAt ? (
                        <Badge tone="red">Aflyst</Badge>
                      ) : match.kind === "TRAINING" ? (
                        <Badge>Træning</Badge>
                      ) : match.kind === "OTHER" ? (
                        <Badge>Aktivitet</Badge>
                      ) : match.isHome !== null ? (
                        <Badge tone="accent">{match.isHome ? "Hjemme" : "Ude"}</Badge>
                      ) : null}
                      {match.source === "MANUAL" && match._count.signups > 0 && (
                        <span className="text-xs text-slate-500">{match._count.signups} kommer</span>
                      )}
                      {match.tasks.length > 0 && (
                        <span className="text-xs text-slate-500">
                          {match.tasks.length === 1 ? "1 opgave" : `${match.tasks.length} opgaver`}
                        </span>
                      )}
                    </div>
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

function groupByMonth<T extends { startsAt: Date }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = readInZone(row.startsAt, "MMMM yyyy");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}
