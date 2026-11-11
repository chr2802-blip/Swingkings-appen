import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { readInZone } from "@/lib/time";
import { teamRoster } from "@/lib/roster";
import { taskCandidates } from "@/lib/tasks";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { TemplateDialog } from "@/components/template-dialog";
import { SyncButton } from "@/components/sync-button";
import { TeamSettingsForm } from "@/components/team-settings-form";
import { InviteForm } from "@/components/invite-form";
import { ActionButton } from "@/components/action-button";
import { revokeInvite } from "@/app/actions/teams";
import { deleteTaskTemplate } from "@/app/actions/activities";

export default async function TeamSettingsPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/spillere");
  const db = teamDb(user.teamId);
  const [team, invites, templates, roster, candidates] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: user.teamId },
      select: { name: true, theme: true, finePriceKr: true, calendarUrl: true, calendarSyncedAt: true, photoId: true },
    }),
    db.invite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    db.taskTemplate.findMany({ orderBy: { createdAt: "asc" } }),
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
      <PageHeader title="Holdindstillinger" />
      <Card>
        <TeamSettingsForm team={team} />
      </Card>

      <section id="standardopgaver" className="scroll-mt-24">
        <SectionTitle action={<TemplateDialog />}>Standardopgaver</SectionTitle>
        <p className="mb-3 text-sm text-slate-500">
          Faste opgaver som trøjevask og opkridtning. Du vælger dem, når du opretter en aktivitet, og dem markeret
          “automatisk” lægger kalendersyncen selv på nye kampe fra KampKlar. Alle fordeles retfærdigt — dem med færrest
          opgaver først.
        </p>
        {team.calendarUrl && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>
              KampKlar hentes hver morgen
              {team.calendarSyncedAt && ` · senest ${readInZone(team.calendarSyncedAt, "d. MMM 'kl.' HH:mm")}`}
            </span>
            <SyncButton />
          </div>
        )}
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
          <SectionTitle>Opgavefordelingen det seneste år</SectionTitle>
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

      <section>
        <SectionTitle>Inviter til holdet</SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-slate-500">
            Du får en engangskode, som du sender til personen (SMS, Messenger…). De opretter sig på{" "}
            <strong>/accept-invite</strong> med deres e-mail og koden. Koden gælder i 14 dage.
          </p>
          <InviteForm />
          {invites.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {invite.email} <span className="text-slate-500">· {ROLE_LABEL[invite.role]}</span>
                  </span>
                  <span className="text-xs text-slate-500">udløber {readInZone(invite.expiresAt, "d. MMM")}</span>
                  <ActionButton action={revokeInvite} fields={{ inviteId: invite.id }} label="Træk tilbage" variant="ghost" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
