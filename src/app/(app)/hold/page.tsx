import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_DESCRIPTION, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
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
import { InviteLinkForm } from "@/components/invite-link-form";
import { MemberDialog } from "@/components/member-dialog";
import { ActionButton } from "@/components/action-button";
import { ActionMenu } from "@/components/action-menu";
import { removeMember, revokeInviteLink } from "@/app/actions/teams";
import { deleteTaskTemplate } from "@/app/actions/activities";

export default async function TeamSettingsPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/spillere");
  const db = teamDb(user.teamId);
  const [team, links, templates, roster, candidates] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: user.teamId },
      select: { name: true, theme: true, finePriceKr: true, calendarUrl: true, calendarSyncedAt: true, photoId: true },
    }),
    db.inviteLink.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
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

      <section id="medlemmer" className="scroll-mt-24">
        <SectionTitle>Medlemmer og roller</SectionTitle>
        <Card className="mb-3 space-y-1 text-sm text-slate-600">
          {(["PLAYER", "TREASURER", "ADMIN"] as const).map((role) => (
            <p key={role}>
              <strong className="font-medium text-slate-800">{ROLE_LABEL[role]}:</strong> {ROLE_DESCRIPTION[role]}
            </p>
          ))}
        </Card>
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {roster.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={member.name} photoId={member.photoId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={member.role === "PLAYER" ? undefined : "accent"}>{ROLE_LABEL[member.role]}</Badge>
                    {member.superAdmin && <Badge tone="accent">{SUPER_ADMIN_LABEL}</Badge>}
                  </div>
                </div>
                <ActionMenu icon label={`Handlinger for ${member.name}`} title={member.name}>
                  <MemberDialog member={member} />
                  {member.userId !== user.id && (
                    <ActionButton
                      action={removeMember}
                      fields={{ userId: member.userId }}
                      label="Fjern fra holdet"
                      variant="danger"
                      confirm={`Fjern ${member.name} fra holdet?`}
                      confirmLabel="Fjern fra holdet"
                    />
                  )}
                </ActionMenu>
              </li>
            ))}
          </ul>
        </Card>
      </section>

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
                  <ActionMenu icon label={`Handlinger for ${t.title}`} title={t.title}>
                    <TemplateDialog template={t} />
                    <ActionButton
                      action={deleteTaskTemplate}
                      fields={{ id: t.id }}
                      label="Slet"
                      variant="danger"
                      confirm={`Slet “${t.title}”?`}
                      confirmLabel="Slet"
                    />
                  </ActionMenu>
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
            Lav et link og send det i holdets gruppechat, på SMS eller Messenger. Den der åbner det, opretter
            sig selv — eller logger ind, hvis de allerede har en konto — og kommer med som spiller. Roller giver
            du ovenfor. Linket virker for det antal personer, du vælger, og kun indtil det udløber.
          </p>
          <InviteLinkForm teamName={team.name} />
          {links.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      Link <span className="text-slate-500">· lavet af {link.createdBy.name}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {link.uses >= link.maxUses ? "Brugt op" : `${link.uses} af ${link.maxUses} brugt`} · udløber{" "}
                      {readInZone(link.expiresAt, "d. MMM")}
                    </p>
                  </div>
                  <ActionButton action={revokeInviteLink} fields={{ linkId: link.id }} label="Træk tilbage" variant="ghost" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
