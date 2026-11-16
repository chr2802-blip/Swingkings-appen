import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { readInZone, startOfDayInZone } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { ActivityDialog } from "@/components/activity-dialog";
import { SyncButton } from "@/components/sync-button";
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
  tasks: { where: { doneAt: null }, select: { id: true } },
  signups: { select: { going: true } },
} satisfies Prisma.MatchSelect;

type Row = Prisma.MatchGetPayload<{ select: typeof ROW }>;

/**
 * Every activity — matches, trainings and the rest — in one list in the order they are
 * played, from today. The earlier ones are folded away under "Vis tidligere", newest first.
 * Each row says one thing on its right — that it is cancelled, or its open jobs — and under
 * its time and place how many come, are available and have said no.
 */
export default async function ActivitiesPage() {
  const user = await requireTeamUser();
  const admin = canAdministerTeam(user, user.teamId);
  const today = startOfDayInZone();
  const db = teamDb(user.teamId);

  const [team, upcoming, earlier, templates, copyable] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { calendarUrl: true } }),
    db.match.findMany({ where: { startsAt: { gte: today } }, orderBy: { startsAt: "asc" }, take: EACH_WAY, select: ROW }),
    db.match.findMany({ where: { startsAt: { lt: today } }, orderBy: { startsAt: "desc" }, take: EACH_WAY, select: ROW }),
    templateOptions(user.teamId),
    copyableActivities(user.teamId),
  ]);

  return (
    <div>
      <PageHeader title="Aktiviteter" action={team.calendarUrl && <SyncButton />} />
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
        <EmptyState icon="📅">Ingen kommende aktiviteter i kalenderen.</EmptyState>
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
                        {readInZone(match.startsAt, "HH:mm")}
                        {match.kind === "MATCH" && match.isHome !== null && ` · ${match.isHome ? "Hjemme" : "Ude"}`}
                        {match.location && ` · ${match.location}`}
                      </p>
                      {!match.cancelledAt && <SignupLine match={match} />}
                    </div>
                    <RowNote match={match} />
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

/** The one thing a row says on its right, if anything. */
function RowNote({ match }: { match: Row }) {
  if (match.cancelledAt) return <Badge tone="red">Aflyst</Badge>;
  const open = match.tasks.length;
  if (open > 0) return <span className="shrink-0 text-xs text-slate-500">{open === 1 ? "1 opgave" : `${open} opgaver`}</span>;
  return null;
}

const STATUS_LINE = [
  { key: "going", word: "kommer", dot: "bg-emerald-500" },
  { key: "available", word: "til rådighed", dot: "bg-amber-400" },
  { key: "notGoing", word: "kommer ikke", dot: "bg-red-400" },
] as const;

/** "● 8 ● 2 ● 3": who comes, who is available and who has said no — a word for each to a screen reader. */
function SignupLine({ match }: { match: Row }) {
  const counts = signupCounts(match);
  if (!counts) return null;
  const shown = STATUS_LINE.filter((s) => s.key !== "available" || counts.available > 0);
  return (
    <p className="mt-0.5 flex gap-3 text-xs text-slate-600">
      {shown.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1" title={s.word}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
          {counts[s.key]}
          <span className="sr-only"> {s.word}</span>
        </span>
      ))}
    </p>
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
