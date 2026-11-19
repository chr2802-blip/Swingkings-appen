import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/photo";
import { CreateTeamForm } from "@/components/create-team-form";
import { ActionButton } from "@/components/action-button";
import { createDemoTeamAction, deleteTeam, removeDemoTeamAction, visitTeam } from "@/app/actions/teams";
import { DEMO_TEAM_NAME } from "@/lib/demo-team";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, SectionTitle } from "@/components/ui";
import { deleteClubLogo, saveClubLogo } from "@/app/actions/club-logos";
import { logoUrl } from "@/lib/club-logos";

/** The installation: every team on it. Reads across teams on purpose, so `prisma` directly. */
export default async function AdminPage() {
  await requireSuperAdmin();
  const logos = await prisma.clubLogo.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
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
        <SectionTitle>Testdata</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-slate-600">
            Holdet &quot;{DEMO_TEAM_NAME}&quot; midt i en sæson: 18 opdigtede spillere, fire måneders bøder og
            udfordringer, omkring 40 aktiviteter med opgaver, en chat og et feed med billeder og afstemninger, så
            appen kan prøves af. Du bliver ikke medlem af det, men kigger på det som super admin. Spillerne kan
            ikke logge ind.
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
      </section>
      <section aria-labelledby="logos-title">
        <SectionTitle>
          <span id="logos-title">Klublogoer</span>
        </SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-slate-600">
            Modstandernes logoer vises på kampplakaten på kampdagen, for alle hold. Skriv klubbens navn, som det står i
            kampprogrammet; &quot;Hvidovre IF&quot; dækker også &quot;Hvidovre IF (2)&quot;. Et nyt logo til en klub
            erstatter det gamle.
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
      </section>
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
                    {team._count.members} spillere · {team._count.matches} aktiviteter · {team._count.fines} bøder
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
