import type { RosterMember } from "@/lib/roster";
import { ROLE_LABEL, SUPER_ADMIN_LABEL } from "@/lib/access";
import { RIGHT_CELL, RIGHT_COLUMNS } from "@/lib/role-stack";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { MemberDialog } from "@/components/member-dialog";
import { MemberRights } from "@/components/member-rights";
import { ActionButton } from "@/components/action-button";
import { ActionMenu } from "@/components/action-menu";
import { removeMember } from "@/app/actions/teams";

/**
 * The admin's view of the roster: a tick for Bøder, Admin and kontingent per member,
 * saved on the press, and a menu for the rest. Everybody else sees the plain list.
 */
export function MemberTable({ roster, userId }: { roster: RosterMember[]; userId: string }) {
  return (
    <>
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
                {member.userId !== userId && (
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
    </>
  );
}
