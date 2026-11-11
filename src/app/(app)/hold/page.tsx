import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { readInZone } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { TeamSettingsForm } from "@/components/team-settings-form";
import { InviteLinkForm } from "@/components/invite-link-form";
import { ActionButton } from "@/components/action-button";
import { revokeInviteLink } from "@/app/actions/teams";

export default async function TeamSettingsPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/spillere");
  const now = new Date();
  const [team, links] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: user.teamId },
      select: { name: true, theme: true, finePriceKr: true, calendarUrl: true, photoId: true },
    }),
    teamDb(user.teamId).inviteLink.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Holdindstillinger" />
      <Card>
        <TeamSettingsForm team={team} />
      </Card>

      <section>
        <SectionTitle>Inviter til holdet</SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-slate-500">
            Lav et link og send det i holdets gruppechat, på SMS eller Messenger. Den der åbner det, opretter
            sig selv — eller logger ind, hvis de allerede har en konto. Linket virker for det antal personer, du
            vælger, og kun indtil det udløber.
          </p>
          <InviteLinkForm teamName={team.name} />
          {links.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {ROLE_LABEL[link.role]} <span className="text-slate-500">· lavet af {link.createdBy.name}</span>
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
