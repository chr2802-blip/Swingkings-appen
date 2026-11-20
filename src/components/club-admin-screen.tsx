import { notFound } from "next/navigation";
import { allClubs, clubForAdmin, clubPlayers } from "@/lib/clubs";
import { clubLogos } from "@/lib/club-logos";
import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { CreateAction } from "@/components/create-button";
import { NewTeamDialog } from "@/components/admin-dialogs";
import { ClubCrest, TeamRow } from "@/components/admin-screen";
import { SwipePages } from "@/components/swipe-pages";
import { Card, EmptyState, Field, Input, SectionTitle, Select } from "@/components/ui";
import { addClubAdmin, deleteClub, removeClubAdmin, renameClub } from "@/app/actions/club";

/**
 * One club on the super admin's page, as tabs: its teams (the "+" makes a new one in it, and
 * a team can be moved to another club), its club admins, and its name — and deleting it,
 * once it has no teams. A club that does not exist is not found.
 */
export async function ClubAdminScreen({ clubId }: { clubId: string }) {
  const club = await clubForAdmin(clubId);
  if (!club) notFound();
  const [clubs, players, crests] = await Promise.all([allClubs(), clubPlayers(club.id), clubLogos([club.name])]);
  const others = clubs.filter((c) => c.id !== club.id).map(({ id, name }) => ({ id, name }));
  const candidates = players.filter((p) => !club.admins.some((a) => a.user.id === p.id));
  const base = `/admin/klubber/${club.id}`;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <ClubCrest name={club.name} src={crests.get(club.name)} />
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words">{club.name}</h1>
      </div>
      <CreateAction>
        <NewTeamDialog clubId={club.id} />
      </CreateAction>
      <SwipePages
        label="Klubbens sider"
        pages={[
          {
            href: base,
            title: "Hold",
            children:
              club.teams.length === 0 ? (
                <EmptyState icon="⚽">Ingen hold i klubben endnu. Opret det første med +.</EmptyState>
              ) : (
                <Card padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {club.teams.map((team) => (
                      <TeamRow key={team.id} team={{ ...team, club: { id: club.id, name: club.name } }} clubs={others} />
                    ))}
                  </ul>
                </Card>
              ),
          },
          {
            href: `${base}/admins`,
            title: "Klubadmins",
            children: (
              <Card className="space-y-4">
                <p className="text-sm text-slate-600">
                  Klubbens admins laver klubopslag og klubaktiviteter til de hold, de vælger, og alle på holdene kan
                  kommentere, stemme og tilmelde sig. En klubadmin skal spille på et af klubbens hold.
                </p>
                {club.admins.length > 0 && (
                  <ul className="divide-y divide-slate-100 border-y border-slate-100">
                    {club.admins.map(({ user }) => (
                      <li key={user.id} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {user.name} <span className="text-slate-500">· Klubadmin</span>
                        </span>
                        <ActionButton
                          action={removeClubAdmin}
                          fields={{ clubId: club.id, userId: user.id }}
                          label="Fjern"
                          variant="ghost"
                          confirm={`Fjern ${user.name} som klubadmin i ${club.name}?`}
                          confirmLabel="Fjern klubadmin"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {candidates.length > 0 ? (
                  <ActionForm action={addClubAdmin} submitLabel="Gør til klubadmin" className="grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="clubId" value={club.id} />
                    <Field label="Ny klubadmin" htmlFor="club-admin">
                      <Select id="club-admin" name="userId" defaultValue={candidates[0]!.id}>
                        {candidates.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </ActionForm>
                ) : (
                  club.teams.length === 0 && <p className="text-sm text-slate-500">Opret et hold i klubben først.</p>
                )}
              </Card>
            ),
          },
          {
            href: `${base}/indstillinger`,
            title: "Indstillinger",
            children: (
              <div className="space-y-8">
                <Card>
                  <ActionForm action={renameClub} submitLabel="Gem" className="grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="clubId" value={club.id} />
                    <Field label="Klubbens navn" htmlFor="club-rename">
                      <Input id="club-rename" name="name" required maxLength={80} defaultValue={club.name} />
                    </Field>
                  </ActionForm>
                </Card>
                <section>
                  <SectionTitle>Slet klubben</SectionTitle>
                  <Card className="space-y-3">
                    <p className="text-sm text-slate-600">
                      {club.teams.length > 0
                        ? "Et hold skal altid have en klub. Flyt eller slet klubbens hold, før klubben kan slettes."
                        : "Klubben slettes med alle klubopslag og klubaktiviteter."}
                    </p>
                    {club.teams.length === 0 && (
                      <ActionButton
                        action={deleteClub}
                        fields={{ clubId: club.id }}
                        label="Slet klub"
                        variant="danger"
                        confirm={`Slet ${club.name} med alle klubopslag og klubaktiviteter?`}
                        confirmLabel="Slet klubben"
                      />
                    )}
                  </Card>
                </section>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
