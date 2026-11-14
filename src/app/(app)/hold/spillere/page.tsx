import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { teamRoster } from "@/lib/roster";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { playerHref } from "@/components/player-link";
import Link from "next/link";

export default async function RosterPage() {
  const user = await requireTeamUser();
  const admin = canAdministerTeam(user, user.teamId);
  const roster = await teamRoster(user.teamId);
  const paid = roster.filter((m) => m.duesPaid).length;
  return (
    <div>
      <PageHeader
        title="Spillere"
        description={`${roster.length} på ${user.teamName} · ${paid} af ${roster.length} har betalt kontingent`}
        action={
          admin && (
            <ButtonLink href="/hold#medlemmer" variant="secondary">
              Ret roller
            </ButtonLink>
          )
        }
      />
      <Card padded={false}>
        <ul className="divide-y divide-slate-100">
          {roster.map((member) => (
            <li key={member.userId}>
              <Link href={playerHref(member.userId)} className="press-card flex items-center gap-3 px-4 py-3">
              <Avatar name={member.name} photoId={member.photoId} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.name}
                  {member.shirtNumber != null && <span className="ml-1.5 text-sm text-slate-400">#{member.shirtNumber}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {member.superAdmin && <Badge tone="accent">{SUPER_ADMIN_LABEL}</Badge>}
                  {member.role !== "PLAYER" && <Badge tone="accent">{ROLE_LABEL[member.role]}</Badge>}
                  {member.duesPaid ? <Badge tone="green">Kontingent betalt</Badge> : <Badge tone="amber">Mangler kontingent</Badge>}
                  {!member.takesTasks && <Badge>Ingen opgaver</Badge>}
                </div>
              </div>
              <span aria-hidden className="text-slate-300">
                ›
              </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-6 text-center text-sm">
        <Link href="/hold/saesoner" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
          Tidligere sæsoner
        </Link>
      </p>
    </div>
  );
}
