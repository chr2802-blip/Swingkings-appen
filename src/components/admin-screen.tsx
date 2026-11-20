import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { allClubs } from "@/lib/clubs";
import { clubLogos, logoUrl } from "@/lib/club-logos";
import { DEMO_TEAM_NAME } from "@/lib/demo-team";
import { Avatar } from "@/components/photo";
import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { CreateMenu } from "@/components/create-button";
import { NewClubDialog, NewTeamDialog } from "@/components/admin-dialogs";
import { SwipePages } from "@/components/swipe-pages";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { createDemoTeamAction, deleteTeam, removeDemoTeamAction, visitTeam } from "@/app/actions/teams";
import { setTeamClubAction } from "@/app/actions/club";
import { deleteClubLogo, saveClubLogo } from "@/app/actions/club-logos";

type Club = { id: string; name: string };

/**
 * The super admin's page, as tabs: the clubs (each opens its own page, where its teams are
 * made), every team on the installation, the clubs' logos and the test team. The "+" makes a
 * club or a team in one. Reads across teams on purpose, so `prisma` directly.
 */
export async function AdminScreen() {
  const [clubs, teams, logos] = await Promise.all([
    allClubs(),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        photoId: true,
        isDemo: true,
        club: { select: { id: true, name: true } },
        _count: { select: { members: true, fines: true, matches: true } },
      },
    }),
    prisma.clubLogo.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const clubChoices = clubs.map(({ id, name }) => ({ id, name }));
  const crests = await clubLogos(clubs.map((c) => c.name));

  return (
    <div>
      <PageHeader title="Admin" description="Alle klubber og hold på installationen." />
      <CreateMenu>
        <NewClubDialog />
        {clubs.length > 0 && <NewTeamDialog clubs={clubChoices} />}
      </CreateMenu>
      <SwipePages
        label="Admins sider"
        pages={[
          {
            href: "/admin",
            title: "Klubber",
            children:
              clubs.length === 0 ? (
                <EmptyState icon="🏟️">Ingen klubber endnu. Opret den første med +.</EmptyState>
              ) : (
                <Card padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {clubs.map((club) => (
                      <li key={club.id}>
                        <Link href={`/admin/klubber/${club.id}`} className="press-card flex items-center gap-3 px-4 py-3">
                          <ClubCrest name={club.name} src={crests.get(club.name)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{club.name}</p>
                            <p className="text-xs text-slate-500">
                              {club._count.teams} hold · {club._count.admins} {club._count.admins === 1 ? "klubadmin" : "klubadmins"}
                            </p>
                          </div>
                          <span aria-hidden className="text-slate-300">
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ),
          },
          {
            href: "/admin/hold",
            title: "Hold",
            children:
              teams.length === 0 ? (
                <EmptyState icon="⚽">Ingen hold endnu. Opret en klub, og lav holdene på dens side.</EmptyState>
              ) : (
                <Card padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {teams.map((team) => (
                      <TeamRow key={team.id} team={team} clubs={clubChoices} showClub />
                    ))}
                  </ul>
                </Card>
              ),
          },
          {
            href: "/admin/logoer",
            title: "Klublogoer",
            children: <LogoTab logos={logos} />,
          },
          {
            href: "/admin/testdata",
            title: "Testdata",
            children: (
              <Card>
                <p className="mb-3 text-sm text-slate-600">
                  Holdet &quot;{DEMO_TEAM_NAME}&quot; midt i en sæson: 18 opdigtede spillere, fire måneders bøder og
                  udfordringer, omkring 40 aktiviteter med opgaver, en chat og et feed med billeder og afstemninger, så
                  appen kan prøves af. Du bliver ikke medlem af det, men kigger på det som super admin. Spillerne kan
                  ikke logge ind. Det står under fanen Hold.
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    action={createDemoTeamAction}
                    fields={{}}
                    label="Opret testhold"
                    confirm="Opret testholdet? Findes det allerede, laves det forfra."
                    confirmLabel="Opret testhold"
                  />
                  <ActionButton
                    action={removeDemoTeamAction}
                    fields={{}}
                    label="Slet testhold"
                    variant="ghost"
                    confirm="Slet testholdet og alle dets opdigtede spillere?"
                    confirmLabel="Slet testholdet"
                  />
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * A team on the super admin's pages: what is on it, looking into it, deleting it — and the
 * club it is in, which it can be moved from to another (a team always has one; the test team
 * and teams from before clubs may have none, and are put in one here).
 */
export function TeamRow({
  team,
  clubs,
  showClub = false,
}: {
  team: {
    id: string;
    name: string;
    photoId: string | null;
    isDemo?: boolean;
    club?: Club | null;
    _count: { members: number; fines: number; matches: number };
  };
  clubs: Club[];
  /** On the list of every team: which club it is in. */
  showClub?: boolean;
}) {
  const current = team.club?.id;
  const elsewhere = clubs.filter((c) => c.id !== current);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={team.name} photoId={team.photoId} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {team.name}
          {showClub &&
            (team.club ? (
              <Link href={`/admin/klubber/${team.club.id}`} className="press-text tap-inline text-xs font-normal text-[var(--accent-text)]">
                {team.club.name}
              </Link>
            ) : (
              !team.isDemo && <Badge tone="amber">Uden klub</Badge>
            ))}
        </p>
        <p className="text-xs text-slate-500">
          {team._count.members} spillere · {team._count.matches} aktiviteter · {team._count.fines} bøder
        </p>
        {elsewhere.length > 0 && (!showClub || !team.club) && (
          <ActionForm action={setTeamClubAction} submitLabel={current ? "Flyt" : "Gem klub"} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="teamId" value={team.id} />
            <label className="sr-only" htmlFor={`team-club-${team.id}`}>
              {current ? `Flyt ${team.name} til klub` : `Klub for ${team.name}`}
            </label>
            <Select id={`team-club-${team.id}`} name="clubId" defaultValue={elsewhere[0]!.id}>
              {elsewhere.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </Select>
          </ActionForm>
        )}
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
  );
}

/** A club's logo, from Klublogoer, when one is saved under its name; else its initials. */
export function ClubCrest({ name, src }: { name: string; src?: string }) {
  if (!src) return <Avatar name={name} />;
  // eslint-disable-next-line @next/next/no-img-element -- served from a session-checked route.
  return <img src={src} alt="" className="h-10 w-10 shrink-0 object-contain" />;
}

function LogoTab({ logos }: { logos: { id: string; name: string }[] }) {
  return (
    <Card className="space-y-4">
      <p className="text-sm text-slate-600">
        Modstandernes logoer vises på kampplakaten på kampdagen, for alle hold. Skriv klubbens navn, som det står i
        kampprogrammet; &quot;Hvidovre IF&quot; dækker også &quot;Hvidovre IF (2)&quot;. Et nyt logo til en klub erstatter det
        gamle.
      </p>
      <ActionForm action={saveClubLogo} submitLabel="Gem logo" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
        <Field label="Klub" htmlFor="logo-name">
          <Input id="logo-name" name="name" required maxLength={80} placeholder="Fx Hvidovre IF" />
        </Field>
        <Field label="Logo" htmlFor="logo-file" hint="PNG, JPEG eller WebP, højst 300 kB. PNG med gennemsigtig baggrund ser bedst ud.">
          <Input id="logo-file" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="press-card" />
        </Field>
      </ActionForm>
      {logos.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {logos.map((logo) => (
            <li key={logo.id} className="flex items-center gap-3 py-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- served from a session-checked route. */}
              <img src={logoUrl(logo.id)} alt="" className="h-10 w-10 object-contain" />
              <span className="min-w-0 flex-1 truncate font-medium">{logo.name}</span>
              <ActionButton
                action={deleteClubLogo}
                fields={{ id: logo.id }}
                label="Slet"
                variant="ghost"
                confirm={`Slet logoet for ${logo.name}?`}
                confirmLabel="Slet logo"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
