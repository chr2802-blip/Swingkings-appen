import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL } from "@/lib/access";
import { teamRoster } from "@/lib/roster";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { MemberDialog } from "@/components/member-dialog";
import { ActionButton } from "@/components/action-button";
import { removeMember } from "@/app/actions/teams";

export default async function RosterPage() {
  const user = await requireTeamUser();
  const admin = canAdministerTeam(user, user.teamId);
  const roster = await teamRoster(user.teamId);
  return (
    <div>
      <PageHeader title="Spillere" description={`${roster.length} på ${user.teamName}`} />
      <Card padded={false}>
        <ul className="divide-y divide-slate-100">
          {roster.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={member.name} photoId={member.photoId} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.name}
                  {member.shirtNumber != null && <span className="ml-1.5 text-sm text-slate-400">#{member.shirtNumber}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {member.role !== "PLAYER" && <Badge tone="accent">{ROLE_LABEL[member.role]}</Badge>}
                  {!member.takesTasks && <Badge>Ingen opgaver</Badge>}
                </div>
              </div>
              {admin && (
                <>
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
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
