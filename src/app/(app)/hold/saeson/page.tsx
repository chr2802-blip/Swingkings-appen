import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam, ROLE_LABEL } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { fineBoard } from "@/lib/fine-data";
import { defaultSeasonName } from "@/lib/season";
import { seasonPreview } from "@/lib/season-data";
import { Badge, ButtonLink, buttonClass, Card, PageHeader } from "@/components/ui";
import { SwipePages, TurnButton } from "@/components/swipe-pages";
import { Avatar } from "@/components/photo";
import { ActionButton } from "@/components/action-button";
import { SyncButton } from "@/components/sync-button";
import { StartSeasonForm } from "@/components/start-season-form";
import { resetFines } from "@/app/actions/fines";
import { removeMember } from "@/app/actions/teams";

/** The steps of "Start ny sæson", one page each; the last one starts it. */
const STEPS = [
  { slug: "boder", title: "Bøder" },
  { slug: "kampklar", title: "KampKlar" },
  { slug: "spillere", title: "Spillere" },
  { slug: "opsaetning", title: "Opsætning" },
  { slug: "start", title: "Start" },
] as const;

const stepHref = (slug: string) => `/hold/saeson?trin=${slug}`;

/**
 * "Start ny sæson" as a flow, one thing at a time: settle the fines, check the KampKlar
 * link, tidy the squad, look over roles, catalogue and standard jobs — then start it.
 * The steps are pages side by side (`SwipePages`): swiped between, or turned with
 * "Næste" and "Tilbage". `?trin=` says which one a reload opens.
 */
export default async function NewSeasonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/hold/saesoner");
  const asked = (await searchParams).trin;
  const initial = Math.max(0, STEPS.findIndex((step) => step.slug === asked));

  const bodies = [
    <FinesStep key="boder" teamId={user.teamId} />,
    <CalendarStep key="kampklar" teamId={user.teamId} />,
    <SquadStep key="spillere" teamId={user.teamId} userId={user.id} />,
    <SetupStep key="opsaetning" />,
    <StartStep key="start" teamId={user.teamId} />,
  ];

  return (
    <div>
      <PageHeader title="Start ny sæson" description="Gå trinene igennem ét ad gangen. Swipe, eller tryk Næste." />
      <SwipePages
        label="Trin"
        initial={initial}
        pages={STEPS.map((step, i) => ({
          href: stepHref(step.slug),
          title: step.title,
          children: (
            <div className="space-y-4">
              <p className="text-xs font-medium text-slate-500">
                Trin {i + 1} af {STEPS.length}
              </p>
              {bodies[i]}
              <nav className="flex justify-between gap-2">
                {i > 0 ? (
                  <TurnButton to={i - 1} className={buttonClass("secondary")}>
                    Tilbage
                  </TurnButton>
                ) : (
                  <ButtonLink href="/hold#saeson" variant="secondary">
                    Annuller
                  </ButtonLink>
                )}
                {i < STEPS.length - 1 && (
                  <TurnButton to={i + 1} className={buttonClass("primary")}>
                    Næste
                  </TurnButton>
                )}
              </nav>
            </div>
          ),
        }))}
      />
    </div>
  );
}

async function FinesStep({ teamId }: { teamId: string }) {
  const board = await fineBoard(teamId);
  const owing = board.balances.filter((row) => row.owesKr > 0);
  const total = owing.reduce((sum, row) => sum + row.owesKr, 0);
  return (
    <Card className="space-y-3 text-sm text-slate-700">
      <h2 className="text-lg font-semibold text-slate-900">Er bødekassen gjort op?</h2>
      <p>
        Når den nye sæson starter, slettes alle bøder og udfordringer — også dem, der ikke er nulstillet. Nulstil dem, der
        har betalt.
      </p>
      {owing.length === 0 ? (
        <p className="font-medium text-emerald-700">Ingen skylder noget. ✅</p>
      ) : (
        <>
          <p>
            <strong className="text-red-600">{kr(total)}</strong> står udestående hos{" "}
            {owing.length === 1 ? "1 spiller" : `${owing.length} spillere`}.
          </p>
          <ul className="divide-y divide-slate-100">
            {owing.map((row) => {
              const person = board.people.get(row.userId);
              const name = person?.name ?? "Tidligere spiller";
              return (
                <li key={row.userId} className="flex items-center gap-3 py-2">
                  <Avatar name={name} photoId={person?.photoId ?? null} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                  <span className="text-red-600">{kr(row.owesKr)}</span>
                  <ActionButton
                    action={resetFines}
                    fields={{ playerId: row.userId }}
                    label="Nulstil"
                    variant="ghost"
                    confirm={`Nulstil ${name}s bøder?`}
                    confirmLabel="Nulstil"
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

async function CalendarStep({ teamId }: { teamId: string }) {
  const [team, preview] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { calendarUrl: true, calendarSyncedAt: true } }),
    seasonPreview(teamId),
  ]);
  return (
    <Card className="space-y-3 text-sm text-slate-700">
      <h2 className="text-lg font-semibold text-slate-900">Passer kalenderen fra KampKlar?</h2>
      {team.calendarUrl ? (
        <>
          <p className="break-all text-xs text-slate-500">{team.calendarUrl}</p>
          <p>
            Har holdet fået et nyt kalenderlink til den nye sæson? Ret det under{" "}
            <Go href="/hold">Holdindstillinger</Go>
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
        {preview.activities === 1 ? "1 afsluttet aktivitet slettes" : `${preview.activities} afsluttede aktiviteter slettes`}{" "}
        med deres opgaver. Kommende aktiviteter bliver.
      </p>
    </Card>
  );
}

async function SquadStep({ teamId, userId }: { teamId: string; userId: string }) {
  const { roster } = await fineBoard(teamId);
  return (
    <Card className="space-y-3 text-sm text-slate-700">
      <h2 className="text-lg font-semibold text-slate-900">Er alle stadig med?</h2>
      <p>Fjern dem, der er stoppet. Kontingentet sættes til “Mangler” for alle, når sæsonen starter.</p>
      <ul className="divide-y divide-slate-100">
        {roster.map((member) => (
          <li key={member.userId} className="flex items-center gap-3 py-2">
            <Avatar name={member.name} photoId={member.photoId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{member.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {member.role !== "PLAYER" && <Badge tone="accent">{ROLE_LABEL[member.role]}</Badge>}
                {member.duesPaid ? <Badge tone="green">Kontingent betalt</Badge> : <Badge tone="amber">Mangler kontingent</Badge>}
              </div>
            </div>
            {member.userId !== userId && (
              <ActionButton
                action={removeMember}
                fields={{ userId: member.userId }}
                label="Fjern"
                variant="ghost"
                confirm={`Fjern ${member.name} fra holdet?`}
                confirmLabel="Fjern fra holdet"
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SetupStep() {
  return (
    <Card className="space-y-3 text-sm text-slate-700">
      <h2 className="text-lg font-semibold text-slate-900">Passer opsætningen til den nye sæson?</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <Go href="/hold#medlemmer">Roller</Go> — hvem er bødekasseformand og admin?
        </li>
        <li>
          <Go href="/boder/katalog">Bødekataloget</Go> — skal der nye bøder til?
        </li>
        <li>
          <Go href="/hold">Prisen for én bøde</Go> — skal den op eller ned?
        </li>
        <li>
          <Go href="/hold#standardopgaver">Standardopgaverne</Go> — trøjevask, opkridtning, kørsel…
        </li>
      </ul>
    </Card>
  );
}

async function StartStep({ teamId }: { teamId: string }) {
  const preview = await seasonPreview(teamId);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Card className="space-y-4 text-sm text-slate-700">
      <h2 className="text-lg font-semibold text-slate-900">Klar til en ny sæson?</h2>
      <p>Sæsonen har kørt siden {readInZone(preview.startedAt, "d. MMMM yyyy")}. Et resumé gemmes, og så slettes:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          {plural(preview.fines, "bøde", "bøder")}
          {preview.owingKr > 0 && <strong className="text-red-600"> — heraf {kr(preview.owingKr)} ikke nulstillet</strong>}
        </li>
        <li>{plural(preview.challenges, "udfordring", "udfordringer")}</li>
        <li>{plural(preview.activities, "afsluttet aktivitet", "afsluttede aktiviteter")} med opgaver</li>
        <li>{plural(preview.links, "invitationslink", "invitationslinks")}</li>
        <li>Kontingent for {plural(preview.duesPaid, "spiller", "spillere")}</li>
      </ul>
      <p>Holdet får besked, når den nye sæson er startet.</p>
      <StartSeasonForm defaultName={defaultSeasonName(preview.startedAt)} />
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
