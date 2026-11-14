import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { readInZone } from "@/lib/time";
import { teamRoster } from "@/lib/roster";
import { taskCandidates } from "@/lib/tasks";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { TemplateDialog } from "@/components/template-dialog";
import { SyncButton } from "@/components/sync-button";
import { TeamSettingsForm } from "@/components/team-settings-form";
import { InviteLinkForm } from "@/components/invite-link-form";
import { MemberDialog } from "@/components/member-dialog";
import { MemberRights } from "@/components/member-rights";
import { RIGHT_CELL, RIGHT_COLUMNS } from "@/lib/role-stack";
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
      select: { name: true, theme: true, finePriceKr: true, calendarUrl: true, calendarSyncedAt: true, photoId: true, mobilePayLink: true, duesKr: true },
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
          <p>
            Alle er <strong className="font-medium text-slate-800">{ROLE_LABEL.PLAYER}</strong>, og rettighederne bygger
            oven på hinanden. <strong className="font-medium text-slate-800">Bøder</strong> ({ROLE_LABEL.TREASURER.toLowerCase()}):
            bødekataloget og nulstilling. <strong className="font-medium text-slate-800">{ROLE_LABEL.ADMIN}</strong>: alt,
            også medlemmer, invitationer og ny sæson — og altid Bøder.
          </p>
          <p>
            <strong className="font-medium text-slate-800">Betalt</strong>: kontingent for sæsonen, som hele holdet kan se.
          </p>
        </Card>
        <Card padded={false}>
          <div className="flex items-center gap-x-1 border-b border-slate-100 py-2 pl-4 pr-2 text-xs font-medium text-slate-500">
            <span className="min-w-0 flex-1 truncate">
              {roster.filter((m) => m.duesPaid).length}/{roster.length} betalt
            </span>
            {RIGHT_COLUMNS.map((column) => (
              <span key={column} className={RIGHT_CELL}>
                {column}
              </span>
            ))}
            <span className="w-9 shrink-0" aria-hidden />
          </div>
          <ul className="divide-y divide-slate-100">
            {roster.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center gap-x-1 gap-y-1 py-2.5 pl-4 pr-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="hidden sm:contents">
                    <Avatar name={member.name} photoId={member.photoId} size="sm" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <PlayerLink userId={member.userId}>{member.name}</PlayerLink>
                    </p>
                    {member.superAdmin && <p className="truncate text-xs text-[var(--accent-text)]">{SUPER_ADMIN_LABEL}</p>}
                  </div>
                </div>
                <MemberRights userId={member.userId} name={member.name} role={member.role} duesPaid={member.duesPaid} />
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
                <PlayerLink userId={m.userId} className="w-32 truncate">
                  {m.name}
                </PlayerLink>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(m.load / maxLoad) * 100}%` }} />
                </span>
                <span className="w-6 text-right text-slate-500">{m.load}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section id="saeson" className="scroll-mt-24">
        <SectionTitle>Sæson</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-slate-500">
            Når sæsonen er slut: gem et resumé, slet bøder, udfordringer og afsluttede aktiviteter, og nulstil
            kontingentet. Guiden viser først, hvad der sker.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/hold/saeson">Start ny sæson</ButtonLink>
            <ButtonLink href="/hold/saesoner" variant="secondary">
              Tidligere sæsoner
            </ButtonLink>
          </div>
        </Card>
      </section>

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
