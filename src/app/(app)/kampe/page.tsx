import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { readInZone, relativeDay, startOfDayInZone } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Tabs } from "@/components/ui";
import { MatchDialog } from "@/components/match-dialog";
import { SyncButton } from "@/components/sync-button";

type Search = { vis?: string };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { vis } = await searchParams;
  const view = vis === "alle" ? "alle" : vis === "tidligere" ? "tidligere" : "kommende";
  const user = await requireTeamUser();
  const admin = canAdministerTeam(user, user.teamId);
  const today = startOfDayInZone();
  const db = teamDb(user.teamId);

  const [team, matches] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { calendarUrl: true, calendarSyncedAt: true } }),
    db.match.findMany({
      where: {
        ...(view === "alle" ? {} : { kind: "MATCH" }),
        ...(view === "tidligere" ? { startsAt: { lt: today } } : { startsAt: { gte: today } }),
      },
      orderBy: { startsAt: view === "tidligere" ? "desc" : "asc" },
      take: 60,
      select: {
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
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Kampe"
        description={
          team.calendarUrl
            ? `Hentes fra DBU KampKlar${team.calendarSyncedAt ? ` · senest ${readInZone(team.calendarSyncedAt, "d. MMM 'kl.' HH:mm")}` : ""}`
            : admin
              ? "Indsæt holdets kalenderlink fra KampKlar under Holdindstillinger, så kommer kampene automatisk."
              : undefined
        }
        action={
          admin && (
            <>
              {team.calendarUrl && <SyncButton />}
              <MatchDialog />
            </>
          )
        }
      />
      <Tabs
        current={`/kampe${view === "kommende" ? "" : `?vis=${view}`}`}
        items={[
          { href: "/kampe", label: "Kommende kampe" },
          { href: "/kampe?vis=alle", label: "Alle aktiviteter" },
          { href: "/kampe?vis=tidligere", label: "Tidligere" },
        ]}
      />

      {matches.length === 0 ? (
        <EmptyState icon="⚽">
          {view === "tidligere" ? "Ingen tidligere kampe." : "Ingen kommende kampe i kalenderen."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groupByMonth(matches).map(([month, rows]) => (
            <section key={month}>
              <SectionTitle>{month}</SectionTitle>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">
                  {rows.map((match) => (
                    <li key={match.id}>
                      <Link href={`/kampe/${match.id}`} className="press-card flex items-center gap-3 px-4 py-3">
                        <div className="accent-tint-bg flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-[var(--accent-text)]">
                          <span className="text-[10px] font-semibold uppercase">{readInZone(match.startsAt, "EEE")}</span>
                          <span className="text-lg leading-none font-bold">{readInZone(match.startsAt, "d")}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-medium ${match.cancelledAt ? "text-slate-400 line-through" : ""}`}>
                            {match.kind === "MATCH" && match.opponent ? match.opponent : match.title}
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
                          {match.tasks.length > 0 && (
                            <span className="text-xs text-slate-500">{match.tasks.length} opgaver</span>
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
      )}
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
