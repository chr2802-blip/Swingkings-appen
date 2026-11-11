import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_DESCRIPTION, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { teamRoster } from "@/lib/roster";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { readInZone } from "@/lib/time";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { MemberDialog } from "@/components/member-dialog";
import { TeamSettingsForm } from "@/components/team-settings-form";
import { InviteLinkForm } from "@/components/invite-link-form";
import { ActionButton } from "@/components/action-button";
import { removeMember, revokeInviteLink } from "@/app/actions/teams";

export default async function TeamSettingsPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/spillere");
  const now = new Date();
  const [team, links, roster] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: user.teamId },
      select: { name: true, theme: true, finePriceKr: true, calendarUrl: true, photoId: true },
    }),
    teamDb(user.teamId).inviteLink.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
    teamRoster(user.teamId),
  ]);

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
                <MemberDialog member={member} />
                {member.userId !== user.id && (
                  <ActionButton
                    action={removeMember}
                    fields={{ userId: member.userId }}
                    label="Fjern"
                    variant="ghost"
                    confirm={`Fjern ${member.name} fra holdet?`}
                    confirmLabel="Fjern fra holdet"
                  />
                )}
              </li>
            ))}
          </ul>
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
