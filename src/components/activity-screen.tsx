import type { TeamUser } from "@/lib/auth";
import { canAdministerTeam, canManageFines } from "@/lib/access";
import Link from "next/link";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { foundOr404 } from "@/lib/scoped";
import { teamRoster } from "@/lib/roster";
import { fineBoard, fineHistory } from "@/lib/fine-data";
import { kickoffLabel, readInZone, relativeDay, toLocalDateTimeInput } from "@/lib/time";
import { Badge, buttonClass, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { TaskDialog } from "@/components/task-dialog";
import { ActivityDialog } from "@/components/activity-dialog";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { FineHistory } from "@/components/fine-history";
import { ChallengeCard, challengeCardInclude } from "@/components/challenge-card";
import { ActionMenu } from "@/components/action-menu";
import { ActionButton } from "@/components/action-button";
import { SwipePages, TurnButton } from "@/components/swipe-pages";
import { AutoSync } from "@/components/auto-sync";
import { deleteActivity, setSignup } from "@/app/actions/activities";
import { copyableActivities, templateOptions } from "@/lib/activity-data";
import {
  activityName,
  externalSignupSummary,
  KIND_LABEL,
  readExternalSignups,
  signupSummary,
  type SignupPerson,
} from "@/lib/activity";

/** An activity's tabs, in the order they are swiped through: details (with who comes), jobs, fines. */
export const ACTIVITY_TABS = ["", "/opgaver", "/boder"] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export function activityHref(id: string, tab: ActivityTab = "") {
  return `/aktiviteter/${id}${tab}`;
}

/**
 * One activity, on three tabs swiped between — each with its own address, all read at
 * once so a swipe never waits on the server:
 *
 * - **Detaljer**: when and where, the note, and who comes. A hand-made activity is signed
 *   up for here; one from KampKlar is signed up for in KampKlar, behind its link, and
 *   shows who KampKlar says is coming when the feed carries it.
 * - **Opgaver**: the activity's jobs.
 * - **Bøder**: the fines given at it, and its challenges.
 */
export async function ActivityScreen({ user, id, show }: { user: TeamUser; id: string; show: ActivityTab }) {
  const manages = canManageFines(user, user.teamId);
  const db = teamDb(user.teamId);

  const match = await foundOr404(
    db.match.findFirst({
      where: { id },
      include: {
        tasks: { orderBy: { createdAt: "asc" }, select: TASK_SELECT },
        challenges: { orderBy: { createdAt: "desc" }, include: challengeCardInclude },
        signups: { select: { userId: true, going: true } },
      },
    }),
  );
  const [roster, board, team, templates, copyable, fines] = await Promise.all([
    teamRoster(user.teamId),
    fineBoard(user.teamId),
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } }),
    templateOptions(user.teamId),
    copyableActivities(user.teamId, match.id),
    fineHistory(user.teamId, { matchId: match.id }),
  ]);
  const label = activityName(match);
  const fromKampKlar = match.source === "KAMPKLAR";
  const option = [{ id: match.id, label: `${label} · ${kickoffLabel(match.startsAt)}` }];
  const myTasks = match.tasks.filter((t) => !t.doneAt && t.assignees.some((a) => a.user.id === user.id));
  const openTasks = match.tasks.filter((t) => !t.doneAt).length;

  const people = (list: { userId: string; name: string; photoId: string | null }[]): SignupPerson[] =>
    list.map((m) => ({ key: m.userId, name: m.name, userId: m.userId, photoId: m.photoId }));
  const external = readExternalSignups(match.externalSignups);
  const groups = fromKampKlar
    ? external && externalSignupSummary(roster, external)
    : (() => {
        const s = signupSummary(roster, match.signups);
        return { going: people(s.going), available: [], notGoing: people(s.notGoing), unanswered: people(s.unanswered) };
      })();
  // Names from KampKlar nobody here is matched to: an admin can link them to a member.
  const unmatched = fromKampKlar && groups ? [...groups.going, ...groups.available, ...groups.notGoing].filter((p) => !p.userId).length : 0;
  const mine = match.signups.find((s) => s.userId === user.id)?.going;
  const past = (match.endsAt ?? match.startsAt) < new Date();

  const time = `${kickoffLabel(match.startsAt)}${match.endsAt ? `–${readInZone(match.endsAt, "HH:mm")}` : ""}`;

  return (
    <div>
      {/* Who has signed up in KampKlar is what one opens it for: fetched fresh. */}
      {fromKampKlar && <AutoSync />}
      <PageHeader
        title={
          match.kind === "MATCH" && match.opponent
            ? `${match.isHome === false ? "Ude mod" : match.isHome ? "Hjemme mod" : "Mod"} ${match.opponent}`
            : match.title
        }
        action={
          <ActionMenu>
            <TaskDialog members={roster} activityId={match.id} templates={templates} copyable={copyable} />
            <GiveFineDialog
              members={board.roster}
              fineTypes={board.fineTypes}
              finePriceKr={board.finePriceKr}
              matches={option}
              defaultMatchId={match.id}
            />
            {!fromKampKlar && (
              <ActivityDialog
                activity={{
                  id: match.id,
                  title: match.title,
                  startsAtInput: toLocalDateTimeInput(match.startsAt),
                  location: match.location,
                  note: match.note,
                }}
              />
            )}
            {!fromKampKlar && (
              <ActionButton
                action={deleteActivity}
                fields={{ id: match.id }}
                label="Slet aktivitet"
                variant="danger"
                confirm="Slet aktiviteten og dens opgaver?"
                confirmLabel="Slet aktivitet"
              />
            )}
          </ActionMenu>
        }
      />

      <SwipePages
        label="Aktivitetens sider"
        initial={ACTIVITY_TABS.indexOf(show)}
        pages={[
          {
            href: activityHref(match.id),
            title: "Detaljer",
            children: (
              <div>
                <Card className="mb-6 space-y-3">
                  <div>
                    <p className="text-lg font-semibold">{time}</p>
                    <p className="text-sm text-slate-500">{relativeDay(match.startsAt)}</p>
                  </div>
                  {match.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-sm text-slate-600 hover:underline"
                    >
                      <span aria-hidden="true">📍</span>
                      <span>
                        {match.location} <span className="sr-only">(vis på kort)</span>
                      </span>
                    </a>
                  )}
                  {match.kind === "MATCH" && match.title !== label && <p className="text-sm text-slate-600">{match.title}</p>}
                  <div className="flex flex-wrap gap-2">
                    {match.cancelledAt && <Badge tone="red">Aflyst</Badge>}
                    {fromKampKlar && <Badge>Fra DBU KampKlar</Badge>}
                    {match.kind !== "MATCH" && <Badge>{KIND_LABEL[match.kind]}</Badge>}
                  </div>
                  {match.note && <p className="text-sm whitespace-pre-line text-slate-600">{match.note}</p>}
                  {fromKampKlar && match.externalUrl && (
                    <a
                      href={match.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass("secondary", "w-full")}
                    >
                      Åbn i KampKlar ↗
                    </a>
                  )}
                </Card>

                {myTasks.length > 0 && (
                  <TurnButton
                    to={1}
                    className="press-card mb-6 flex w-full items-center gap-3 rounded-2xl border border-[var(--gold)] bg-[var(--gold-tint)] px-4 py-3 text-left text-sm"
                  >
                    <span aria-hidden="true">🧺</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">Din opgave{myTasks.length > 1 ? "r" : ""}: </span>
                      {myTasks.map((t) => t.title).join(", ")}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">›</span>
                  </TurnButton>
                )}

                <section aria-labelledby="signups-title">
                  <SectionTitle>
                    <span id="signups-title">Tilmeldte</span>
                  </SectionTitle>
                  <Card className="space-y-5">
                    {!fromKampKlar && !match.cancelledAt && !past && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">
                          {mine === true ? "Du kommer ✅" : mine === false ? "Du kommer ikke" : "Kommer du?"}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <ActionButton
                            action={setSignup}
                            fields={{ activityId: match.id, going: "yes" }}
                            label="Jeg kommer"
                            variant={mine === true ? "primary" : "secondary"}
                          />
                          <ActionButton
                            action={setSignup}
                            fields={{ activityId: match.id, going: "no" }}
                            label="Jeg kommer ikke"
                            variant={mine === false ? "primary" : "secondary"}
                          />
                        </div>
                      </div>
                    )}
                    {fromKampKlar && (
                      <p className="text-sm text-slate-600">
                        Tilmelding sker i KampKlar
                        {match.externalUrl ? " – tryk “Åbn i KampKlar” ovenfor." : "."}
                      </p>
                    )}
                    {groups ? (
                      <>
                        <SignupTally
                          going={groups.going.length}
                          available={groups.available.length}
                          notGoing={groups.notGoing.length}
                          unanswered={groups.unanswered.length}
                        />
                        <SignupGroup title="Kommer" people={groups.going} />
                        <SignupGroup title="Til rådighed" people={groups.available} />
                        <SignupGroup title="Kommer ikke" people={groups.notGoing} />
                        <SignupGroup title="Har ikke svaret" people={groups.unanswered} muted />
                        {unmatched > 0 && canAdministerTeam(user, user.teamId) && (
                          <p className="text-xs text-slate-500">
                            {unmatched === 1 ? "1 navn" : `${unmatched} navne`} fra KampKlar er ikke koblet til en spiller.{" "}
                            <Link href="/hold/rettigheder" className="font-medium text-[var(--accent-text)]">
                              Kobl under Rettigheder ›
                            </Link>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">KampKlar har ikke sendt tilmeldinger med til denne aktivitet endnu.</p>
                    )}
                  </Card>
                </section>
              </div>
            ),
          },
          {
            href: activityHref(match.id, "/opgaver"),
            title: openTasks > 0 ? `Opgaver (${openTasks})` : "Opgaver",
            children:
              match.tasks.length === 0 ? (
                <EmptyState icon="🧺">Ingen opgaver endnu. Tilføj dem under Handlinger.</EmptyState>
              ) : (
                <Card padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {match.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} viewerId={user.id} showMatch={false} />
                    ))}
                  </ul>
                </Card>
              ),
          },
          {
            href: activityHref(match.id, "/boder"),
            title: fines.length > 0 ? `Bøder (${fines.length})` : "Bøder",
            children: (
              <div>
                {/* The history's rows: a tap opens the fine with everything about it. */}
                {fines.length === 0 ? <EmptyState>Ingen bøder endnu.</EmptyState> : <FineHistory fines={fines} user={user} />}
                {match.challenges.length > 0 && (
                  <section className="mt-8">
                    <SectionTitle>Udfordringer</SectionTitle>
                    <div className="space-y-3">
                      {match.challenges.map((c) => (
                        <ChallengeCard key={c.id} challenge={c} viewerId={user.id} managesFines={manages} finePriceKr={team.finePriceKr} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** The counts at a glance, with a bar that fills with those coming, then those available. */
function SignupTally({
  going,
  available,
  notGoing,
  unanswered,
}: {
  going: number;
  available: number;
  notGoing: number;
  unanswered: number;
}) {
  const total = going + available + notGoing + unanswered || 1;
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          <strong className="text-emerald-700">{going}</strong> kommer
        </span>
        {available > 0 && (
          <span>
            <strong className="text-amber-600">{available}</strong> til rådighed
          </span>
        )}
        <span>
          <strong className="text-red-600">{notGoing}</strong> kommer ikke
        </span>
        <span className="text-slate-500">
          <strong>{unanswered}</strong> mangler svar
        </span>
      </p>
      <div aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
        <span className="bg-emerald-500" style={{ width: `${(going / total) * 100}%` }} />
        <span className="bg-amber-400" style={{ width: `${(available / total) * 100}%` }} />
        <span className="bg-red-400" style={{ width: `${(notGoing / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** A group of people as pictures with their first name under — a teammate's links to their page. */
function SignupGroup({ title, people, muted = false }: { title: string; people: SignupPerson[]; muted?: boolean }) {
  if (people.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-slate-500">
        {title} ({people.length})
      </h3>
      <ul className={`grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6 ${muted ? "opacity-60" : ""}`}>
        {people.map((p) => {
          const face = (
            <>
              <Avatar name={p.name} photoId={p.photoId} size="lg" className={muted ? "grayscale" : ""} />
              <span className="w-full truncate text-center text-xs">{p.name.split(" ")[0]}</span>
            </>
          );
          return (
            <li key={p.key}>
              {p.userId ? (
                <PlayerLink userId={p.userId} aria-label={p.name} className="flex flex-col items-center gap-1 hover:no-underline">
                  {face}
                </PlayerLink>
              ) : (
                <span title={p.name} className="flex flex-col items-center gap-1">
                  {face}
                  <span className="sr-only">{p.name}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
