import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { CreateTeamForm } from "@/components/create-team-form";
import { ActionButton } from "@/components/action-button";
import { deleteTeam, visitTeam } from "@/app/actions/teams";

/** The installation: every team on it. Reads across teams on purpose, so `prisma` directly. */
export default async function AdminPage() {
  await requireSuperAdmin();
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, photoId: true, _count: { select: { members: true, fines: true, matches: true } } },
  });
  return (
    <div className="space-y-8">
      <PageHeader title="Admin" description="Alle hold på installationen." />
      <Card>
        <CreateTeamForm />
      </Card>
      <section>
        <SectionTitle>Hold</SectionTitle>
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {teams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={team.name} photoId={team.photoId} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{team.name}</p>
                  <p className="text-xs text-slate-500">
                    {team._count.members} spillere · {team._count.matches} kampe · {team._count.fines} bøder
                  </p>
                </div>
                <form action={visitTeam.bind(null, team.id)}>
                  <button className="press-button rounded-lg px-3 py-1.5 text-sm text-[var(--accent-text)] hover:bg-slate-100">Åbn</button>
                </form>
                <ActionButton
                  action={deleteTeam}
                  fields={{ teamId: team.id }}
                  label="Slet"
                  variant="ghost"
                  confirm={`Slet ${team.name} og alt dets indhold?`}
                  confirmLabel="Slet holdet"
                />
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
