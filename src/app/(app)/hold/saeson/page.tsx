import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { defaultSeasonName } from "@/lib/season";
import { seasonPreview } from "@/lib/season-data";
import { Card, PageHeader } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";
import { StartSeasonDialog } from "@/components/start-season-dialog";

/**
 * "Start ny sæson", as a list to go through: what is still owed, the KampKlar link, the
 * players and their kontingent, roles, catalogue and standard jobs — then the button.
 */
export default async function NewSeasonPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/saesoner");
  const [preview, team] = await Promise.all([
    seasonPreview(user.teamId),
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { calendarUrl: true, calendarSyncedAt: true } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Start ny sæson"
        description={`Sæsonen har kørt siden ${readInZone(preview.startedAt, "d. MMMM yyyy")}. Gå listen igennem, og start så den nye.`}
      />

      <Step n={1} title="Bøder">
        {preview.owingKr > 0 ? (
          <p>
            <strong className="text-red-600">{kr(preview.owingKr)}</strong> står stadig udestående hos{" "}
            {preview.owingPlayers === 1 ? "1 spiller" : `${preview.owingPlayers} spillere`}. Det slettes med resten.
            Nulstil dem i <Go href="/boder">bødekassen</Go>, når de har betalt.
          </p>
        ) : (
          <p>Ingen skylder noget.</p>
        )}
        <p>
          {preview.fines} {preview.fines === 1 ? "bøde" : "bøder"} og {preview.challenges}{" "}
          {preview.challenges === 1 ? "udfordring" : "udfordringer"} slettes. Et resumé gemmes først.
        </p>
      </Step>

      <Step n={2} title="KampKlar">
        {team.calendarUrl ? (
          <>
            <p className="break-all text-xs text-slate-500">{team.calendarUrl}</p>
            <p>
              Har holdet fået et nyt kalenderlink til den nye sæson? Ret det under <Go href="/hold">Holdindstillinger</Go>
              {team.calendarSyncedAt && `. Senest hentet ${readInZone(team.calendarSyncedAt, "d. MMM 'kl.' HH:mm")}`}.
            </p>
            <SyncButton />
          </>
        ) : (
          <p>
            Holdet har intet KampKlar-link. Tilføj det under <Go href="/hold">Holdindstillinger</Go>.
          </p>
        )}
        <p>
          {preview.activities} {preview.activities === 1 ? "afsluttet aktivitet" : "afsluttede aktiviteter"} slettes med
          deres opgaver. Kommende aktiviteter bliver.
        </p>
      </Step>

      <Step n={3} title="Spillere og kontingent">
        <p>
          {preview.members} på holdet, {preview.duesPaid} har betalt kontingent. Fjern dem, der er stoppet, under{" "}
          <Go href="/hold#medlemmer">Medlemmer</Go>. Alle sættes til “Mangler kontingent”.
        </p>
      </Step>

      <Step n={4} title="Roller, bødekatalog og standardopgaver">
        <p>
          Tjek <Go href="/hold#medlemmer">roller</Go>, <Go href="/boder/katalog">bødekataloget og prisen</Go> og{" "}
          <Go href="/hold#standardopgaver">standardopgaverne</Go>.
        </p>
      </Step>

      <Step n={5} title="Invitationslinks">
        <p>
          {preview.links === 0
            ? "Der er ingen invitationslinks."
            : `${preview.links} ${preview.links === 1 ? "link lukkes" : "links lukkes"}.`}{" "}
          Lav et nyt under <Go href="/hold">Holdindstillinger</Go> bagefter.
        </p>
      </Step>

      <Card className="space-y-3 border-red-200">
        <p className="text-sm text-slate-600">Holdet får besked, når den nye sæson er startet.</p>
        <StartSeasonDialog defaultName={defaultSeasonName(preview.startedAt)} />
      </Card>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2 text-sm text-slate-700">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <span className="accent-tint-bg flex h-6 w-6 items-center justify-center rounded-full text-xs">{n}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
