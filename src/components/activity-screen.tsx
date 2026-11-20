import type { TeamUser } from "@/lib/auth";
import { canAdministerClub, canAdministerTeam } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { reachDb, teamsOf } from "@/lib/club-reach";
import { clubTeams, rosterAcross } from "@/lib/clubs";
import { foundOr404 } from "@/lib/scoped";
import { teamRoster } from "@/lib/roster";
import { challengeRowSelect, fineBoard, fineHistory } from "@/lib/fine-data";
import { kickoffLabel, readInZone, relativeDay, stampLabel, toLocalDateTimeInput } from "@/lib/time";
import { reactionRows, reactorsOf } from "@/lib/reactions";
import { Badge, buttonClass, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { TaskDialog } from "@/components/task-dialog";
import { ActivityDialog } from "@/components/activity-dialog";
import { ClubActivityDialog } from "@/components/club-dialogs";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { FineHistory, historyItems } from "@/components/fine-history";
import { CreateMenu } from "@/components/create-button";
import { ActionButton } from "@/components/action-button";
import { SwipePages, TurnButton } from "@/components/swipe-pages";
import { AutoSync } from "@/components/auto-sync";
import { ActivityComments } from "@/components/activity-comments";
import { ClampedText } from "@/components/clamped-text";
import { deleteActivity } from "@/app/actions/activities";
import { deleteClubActivity } from "@/app/actions/club";
import { SignupChoice } from "@/components/signup-choice";
import { copyableActivities, templateOptions } from "@/lib/activity-data";
import { isTaskOpen } from "@/lib/tasks";
import { clubLogos } from "@/lib/club-logos";
import { FixturePoster, mapsHref } from "@/components/fixture-card";
import { withoutMeetingTime } from "@/lib/fixture";
import {
  activityName,
  activityTitle,
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
 * - **Detaljer**: one card with when and where, the note (folded when long) and the team's
 *   comments on it (`ActivityComments`) — KampKlar's feed says little more — then who has signed up. A hand-made activity is signed up for here; one from KampKlar
 *   in KampKlar, behind its link.
 * - **Opgaver**: the activity's jobs.
 * - **Bøder**: the fines given at it, and its challenges.
 *
 * The "+" makes a job or gives a fine on it; a hand-made activity is changed or deleted
 * with the buttons at the foot of Detaljer.
 */
export async function ActivityScreen({
  user,
  id,
  show,
  openTaskId,
}: {
  user: TeamUser;
  id: string;
  show: ActivityTab;
  /** A job whose sheet a link asked to open (`?opgave=`). */
  openTaskId?: string;
}) {

  // The team's own activity, or a club activity shared with it (read across teams on
  // purpose). On a club activity the jobs and challenges shown are this team's own; the
  // sign-ups and comments are everybody's on it.
  const match = await foundOr404(
    reachDb(user.teamId).match.findFirst({
      where: { id },
      include: {
        club: { select: { id: true, name: true } },
        teams: { select: { teamId: true } },
        tasks: { where: { teamId: user.teamId }, orderBy: { createdAt: "asc" }, select: TASK_SELECT },
        // Only those still waiting: a settled one is in the history as the fines it moved.
        challenges: { where: { teamId: user.teamId, status: "PENDING" }, orderBy: { createdAt: "desc" }, select: challengeRowSelect },
        signups: { select: { userId: true, going: true } },
        comments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            teamId: true,
            parentId: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, name: true, photoId: true } },
            reactions: reactionRows,
          },
        },
      },
    }),
  );
  const club = match.club;
  const clubAdmin = canAdministerClub(user, club?.id);
  const [roster, board, templates, copyable, fines, everybody, ofClub] = await Promise.all([
    teamRoster(user.teamId),
    fineBoard(user.teamId),
    templateOptions(user.teamId),
    copyableActivities(user.teamId, match.id),
    fineHistory(user.teamId, { matchId: match.id }),
    // A club activity's sign-ups are read against everybody on the teams it is shared with.
    club ? rosterAcross(teamsOf(match)) : null,
    club && clubAdmin ? clubTeams(club.id) : null,
  ]);
  const history = historyItems(fines, match.challenges);
  const label = activityName(match);
  const fromKampKlar = match.source === "KAMPKLAR";
  const option = [{ id: match.id, label: `${label} · ${kickoffLabel(match.startsAt)}` }];
  const stillOpen = match.tasks.filter((t) => isTaskOpen({ ...t, match }));
  const myTasks = stillOpen.filter((t) => t.assignees.some((a) => a.user.id === user.id));
  const openTasks = stillOpen.length;

  const people = (list: { userId: string; name: string; photoId: string | null }[]): SignupPerson[] =>
    list.map((m) => ({ key: m.userId, name: m.name, userId: m.userId, photoId: m.photoId }));
  const external = readExternalSignups(match.externalSignups);
  const going: SignupPerson[] = fromKampKlar
    ? external
      ? externalSignupSummary(roster, external).going
      : []
    : people(everybody ? signupSummary(everybody, match.signups).going : signupSummary(roster, match.signups).going);
  const mine = match.signups.find((s) => s.userId === user.id)?.going;
  const past = (match.endsAt ?? match.startsAt) < new Date();

  const admin = canAdministerTeam(user, user.teamId);
  const comments = match.comments.map((comment) => ({
    id: comment.id,
    parentId: comment.parentId,
    body: comment.body,
    stamp: stampLabel(comment.createdAt),
    author: comment.author,
    // A team's admins tidy their own team's comments; on a club activity the club's admins all of them.
    canDelete: comment.author.id === user.id || (comment.teamId === user.teamId && admin) || clubAdmin,
    reactors: reactorsOf(comment.reactions),
  }));

  // A match against somebody heads its details with the poster, as on the front page on match day.
  const poster = match.kind === "MATCH" && match.opponent ? { ...match, opponent: match.opponent } : null;
  const opponentLogo = poster ? (await clubLogos([poster.opponent])).get(poster.opponent) : null;
  // The poster says when to meet; the note does not say it again.
  const note = poster ? withoutMeetingTime(match.note) : match.note;
  const hasDetails = !poster || Boolean(match.cancelledAt || note || (fromKampKlar && match.externalUrl));
  const day = relativeDay(match.startsAt);
  // Within a week it reads "i morgen" or "om 3 dage"; further off it is only the date again.
  const nearby = day !== readInZone(match.startsAt, "d. MMM");
  const time = `${kickoffLabel(match.startsAt)}${match.endsAt ? `–${readInZone(match.endsAt, "HH:mm")}` : ""}`;

  return (
    <div>
      {/* Who has signed up in KampKlar is what one opens it for: fetched fresh. */}
      {fromKampKlar && <AutoSync />}
      <PageHeader
        title={activityTitle(match)}
      />
      <CreateMenu>
        <TaskDialog members={roster} activityId={match.id} templates={templates} copyable={copyable} />
        {/* While the box is open for payment no fines are given. */}
        {!board.paymentOpenedAt && (
          <GiveFineDialog
            members={board.roster}
            fineTypes={board.fineTypes}
            finePriceKr={board.finePriceKr}
            matches={option}
            defaultMatchId={match.id}
            // Given here, the fines pulse in the activity's own Bøder tab, not in the fine box.
            showIn={activityHref(match.id, "/boder")}
          />
        )}
      </CreateMenu>

      <SwipePages
        label="Aktivitetens sider"
        initial={ACTIVITY_TABS.indexOf(show)}
        pages={[
          {
            href: activityHref(match.id),
            title: "Detaljer",
            children: (
              <div>
                {/* One card: what, when and where on top, compact — a long note folded to a few
                    lines — and the team's comments on it underneath. */}
                <Card padded={false} className="mb-6 divide-y divide-slate-100 overflow-hidden">
                  {poster && <FixturePoster match={poster} teamName={user.teamName} opponentLogo={opponentLogo} mapLink />}
                  {hasDetails && (
                    <div className="space-y-2 p-4">
                      {!poster && (
                        <p className="font-semibold">
                          {time}
                          {/* "i morgen", "om 3 dage" — not the date the line above already says. */}
                          {nearby && <span className="font-normal text-slate-500"> · {day}</span>}
                        </p>
                      )}
                      {!poster && match.kind === "MATCH" && match.title !== label && <p className="text-sm text-slate-600">{match.title}</p>}
                      {((match.location && !poster) || match.cancelledAt || match.kind !== "MATCH") && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {match.location && !poster && (
                            <a
                              href={mapsHref(match.location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="press-text -my-1.5 flex items-start gap-1 py-1.5 text-sm text-slate-600 hover:underline"
                            >
                              <span aria-hidden="true">📍</span>
                              <span>
                                {match.location} <span className="sr-only">(vis på kort)</span>
                              </span>
                            </a>
                          )}
                          {(match.cancelledAt || match.kind !== "MATCH") && (
                            <div className="flex flex-wrap gap-1.5">
                              {club && <Badge>Klubaktivitet · {club.name}</Badge>}
                              {match.cancelledAt && <Badge tone="red">Aflyst</Badge>}
                              {match.kind !== "MATCH" && <Badge>{KIND_LABEL[match.kind]}</Badge>}
                            </div>
                          )}
                        </div>
                      )}
                      {note && <ClampedText text={note} className="text-sm text-slate-600" />}
                      {/* A KampKlar activity is signed up for there. */}
                      {fromKampKlar && match.externalUrl && (
                        <a href={match.externalUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "w-full")}>
                          Åbn i KampKlar ↗
                        </a>
                      )}
                    </div>
                  )}
                  <div className="p-4">
                    <ActivityComments
                      matchId={match.id}
                      comments={comments}
                      members={roster.map((m) => ({ userId: m.userId, name: m.name, photoId: m.photoId }))}
                      viewerId={user.id}
                    />
                  </div>
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
                    <span id="signups-title">Tilmeldte ({going.length})</span>
                  </SectionTitle>
                  <Card className="space-y-5">
                    {!fromKampKlar && !match.cancelledAt && !past && (
                      <div className="space-y-3">
                        {/* Once answered, the chosen half of the choice says it; no line repeats it. */}
                        {mine === undefined && <p className="text-sm font-medium">Kommer du?</p>}
                        <SignupChoice activityId={match.id} mine={mine} />
                      </div>
                    )}
                    {going.length > 0 ? <SignupFaces people={going} shirts={new Map((everybody ?? roster).map((m) => [m.userId, m.shirtNumber]))} /> : <p className="text-sm text-slate-500">Ingen tilmeldte endnu. Bliv den første på holdkortet.</p>}
                  </Card>
                </section>

                {/* A club activity is changed and deleted by the club's admins, for all its teams. */}
                {club && ofClub && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    <ClubActivityDialog
                      teams={ofClub}
                      activity={{
                        id: match.id,
                        title: match.title,
                        startsAtInput: toLocalDateTimeInput(match.startsAt),
                        location: match.location,
                        note: match.note,
                        teamIds: teamsOf(match),
                      }}
                    />
                    <ActionButton
                      action={deleteClubActivity}
                      fields={{ id: match.id }}
                      label="Slet klubaktivitet"
                      variant="danger"
                      confirm="Slet klubaktiviteten for alle hold, med tilmeldinger, kommentarer og holdenes opgaver?"
                      confirmLabel="Slet klubaktivitet"
                    />
                  </div>
                )}
                {!fromKampKlar && !club && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    <ActivityDialog
                      activity={{
                        id: match.id,
                        title: match.title,
                        startsAtInput: toLocalDateTimeInput(match.startsAt),
                        location: match.location,
                        note: match.note,
                      }}
                    />
                    <ActionButton
                      action={deleteActivity}
                      fields={{ id: match.id }}
                      label="Slet aktivitet"
                      variant="danger"
                      confirm="Slet aktiviteten og dens opgaver?"
                      confirmLabel="Slet aktivitet"
                    />
                  </div>
                )}
              </div>
            ),
          },
          {
            href: activityHref(match.id, "/opgaver"),
            title: openTasks > 0 ? `Opgaver (${openTasks})` : "Opgaver",
            children:
              match.tasks.length === 0 ? (
                <EmptyState icon="🧺">Ingen opgaver endnu. Tilføj dem med +.</EmptyState>
              ) : (
                <Card padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {match.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} user={user} members={roster} showMatch={false} openTaskId={openTaskId} />
                    ))}
                  </ul>
                </Card>
              ),
          },
          {
            href: activityHref(match.id, "/boder"),
            title: history.length > 0 ? `Bøder (${history.length})` : "Bøder",
            // The history's rows, challenges still waiting among them: a tap opens it in full.
            children:
              history.length === 0 ? (
                <EmptyState icon="😇">Ingen bøder endnu. Alle opførte sig pænt – eller ingen så det.</EmptyState>
              ) : (
                <FineHistory items={history} finePriceKr={board.finePriceKr} />
              ),
          },
        ]}
      />
    </div>
  );
}

/** Those signed up, as pictures with their first name under — a teammate's links to their page. */
function SignupFaces({ people, shirts }: { people: SignupPerson[]; shirts: Map<string, number | null> }) {
  return (
    <ul className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
      {people.map((p) => {
        const face = (
          <>
            <Avatar name={p.name} photoId={p.photoId} shirtNumber={p.userId ? shirts.get(p.userId) : null} size="lg" />
            <span className="w-full truncate text-center text-xs">{p.name.split(" ")[0]}</span>
          </>
        );
        return (
          <li key={p.key}>
            {p.userId ? (
              <PlayerLink userId={p.userId} aria-label={p.name} press="button" className="flex flex-col items-center gap-1">
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
  );
}
