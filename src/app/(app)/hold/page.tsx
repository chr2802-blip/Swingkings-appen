import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { readInZone } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { TeamSettingsForm } from "@/components/team-settings-form";
import { InviteForm } from "@/components/invite-form";
import { ActionButton } from "@/components/action-button";
import { revokeInvite } from "@/app/actions/teams";

export default async function TeamSettingsPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/spillere");
  const [team, invites] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: user.teamId },
      select: { name: true, theme: true, finePriceKr: true, calendarUrl: true, photoId: true },
    }),
    teamDb(user.teamId).invite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
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
