import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { teamRoster } from "@/lib/roster";
import { taskCandidates } from "@/lib/tasks";
import { readInZone } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { TemplateDialog } from "@/components/template-dialog";
import { SyncButton } from "@/components/sync-button";
import { ActionButton } from "@/components/action-button";
import { deleteTaskTemplate } from "@/app/actions/activities";

/**
 * The calendar sync and its standard jobs: what every activity may be given, which of
 * them the KampKlar sync adds to new matches by itself, and how the jobs have been shared.
 */
export default async function TemplatesPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/aktiviteter");
  const [team, templates, roster, candidates] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { calendarUrl: true, calendarSyncedAt: true } }),
    teamDb(user.teamId).taskTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    teamRoster(user.teamId),
    taskCandidates(user.teamId),
  ]);
  const loads = roster
    .filter((m) => m.takesTasks)
    .map((m) => ({ ...m, load: candidates.find((c) => c.userId === m.userId)?.load ?? 0 }))
    .sort((a, b) => b.load - a.load || a.name.localeCompare(b.name, "da"));
  const maxLoad = Math.max(1, ...loads.map((m) => m.load));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Standardopgaver"
        description="Standardopgaver er de faste opgaver, fx trøjevask og opkridtning. Du vælger dem, når du opretter en aktivitet, og dem markeret “automatisk” tilføjes selv til nye kampe fra KampKlar. Alle fordeles retfærdigt — dem med færrest opgaver først."
        action={<TemplateDialog />}
      />

      <section>
        <SectionTitle>DBU KampKlar</SectionTitle>
        <Card className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-slate-600">
            {team.calendarUrl
              ? `Kalenderen hentes hver morgen${team.calendarSyncedAt ? ` · senest ${readInZone(team.calendarSyncedAt, "d. MMM 'kl.' HH:mm")}` : ""}.`
              : "Holdet har ikke et kalenderlink endnu."}{" "}
            <Link href="/hold" className="text-[var(--accent-text)] underline">
              {team.calendarUrl ? "Skift link" : "Indsæt link under Holdindstillinger"}
            </Link>
          </p>
          {team.calendarUrl && <SyncButton />}
        </Card>
      </section>

      <section>
        <SectionTitle>Standardopgaver</SectionTitle>
        {templates.length === 0 ? (
          <EmptyState icon="🧺">Ingen standardopgaver endnu. Fx trøjevask, opkridtning, frugt og kørsel.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {t.title}
                      {t.autoAdd && <Badge tone="accent">Automatisk</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.people === 1 ? "1 person" : `${t.people} personer`}
                      {t.description && ` · ${t.description}`}
                    </p>
                  </div>
                  <TemplateDialog template={t} />
                  <ActionButton
                    action={deleteTaskTemplate}
                    fields={{ id: t.id }}
                    label="Slet"
                    variant="ghost"
                    confirm={`Slet “${t.title}”?`}
                    confirmLabel="Slet"
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {loads.length > 0 && (
        <section>
          <SectionTitle>Fordelingen det seneste år</SectionTitle>
          <Card className="space-y-2">
            {loads.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 text-sm">
                <Avatar name={m.name} photoId={m.photoId} size="xs" />
                <span className="w-32 truncate">{m.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(m.load / maxLoad) * 100}%` }} />
                </span>
                <span className="w-6 text-right text-slate-500">{m.load}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
