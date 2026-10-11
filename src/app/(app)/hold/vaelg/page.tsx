import { requireUser } from "@/lib/auth";
import { switchTeam } from "@/app/actions/teams";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { ROLE_LABEL } from "@/lib/access";

/** Somebody on no team — or choosing between several — lands here. */
export default async function ChooseTeamPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Dine hold" />
      {user.teams.length === 0 ? (
        <EmptyState icon="🏟️">
          Du er ikke på et hold endnu. Bed træneren om en invitation
          {user.role === "SUPER_ADMIN" && ", eller opret et hold under Admin"}.
        </EmptyState>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {user.teams.map((team) => (
              <li key={team.id}>
                <form action={switchTeam.bind(null, team.id)}>
                  <button className="press-card flex w-full items-center gap-3 px-4 py-3 text-left">
                    <Avatar name={team.name} photoId={team.photoId} />
                    <span className="flex-1 font-medium">{team.name}</span>
                    <span className="text-xs text-slate-500">{ROLE_LABEL[team.role]}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
