import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerClub } from "@/lib/access";
import { clubAdmins, clubOfTeam, clubTeams, latestClubPosts, upcomingClubActivities } from "@/lib/clubs";
import { readInZone, startOfDayInZone, stampLabel } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { CreateMenu } from "@/components/create-button";
import { ClubActivityDialog, ClubPostDialog } from "@/components/club-dialogs";

/**
 * The club admin's page: club posts and club activities for the club's teams — each sent to
 * the teams ticked — and what the club has sent so far. The club is the one the team on
 * screen is part of; anybody but its club admins is told it does not exist.
 */
export default async function ClubPage() {
  const user = await requireTeamUser();
  const club = await clubOfTeam(user.teamId);
  if (!club || !canAdministerClub(user, club.id)) notFound();

  const [teams, activities, posts, admins] = await Promise.all([
    clubTeams(club.id),
    upcomingClubActivities(club.id, startOfDayInZone()),
    latestClubPosts(club.id),
    clubAdmins(club.id),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title={club.name} description="Klubopslag og klubaktiviteter til klubbens hold. Alle på de valgte hold kan kommentere, stemme og tilmelde sig." />
      <CreateMenu>
        <ClubPostDialog clubName={club.name} teams={teams} />
        <ClubActivityDialog teams={teams} />
      </CreateMenu>

      <section aria-labelledby="club-activities">
        <SectionTitle>
          <span id="club-activities">Kommende klubaktiviteter</span>
        </SectionTitle>
        {activities.length === 0 ? (
          <EmptyState icon="📅">Ingen kommende klubaktiviteter. Opret én med +.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <Link href={`/aktiviteter/${activity.id}`} className="press-card flex items-center gap-3 px-4 py-3">
                    <div className="accent-tint-bg flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-[var(--accent-text)]">
                      <span className="text-[10px] font-semibold uppercase">{readInZone(activity.startsAt, "EEE")}</span>
                      <span className="text-lg leading-none font-bold">{readInZone(activity.startsAt, "d")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${activity.cancelledAt ? "text-slate-400 line-through" : ""}`}>{activity.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {readInZone(activity.startsAt, "d. MMM 'kl.' HH:mm")} · {activity._count.teams} hold
                      </p>
                    </div>
                    <Badge tone="green">{activity.signups.length} tilmeldt</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="club-posts">
        <SectionTitle>
          <span id="club-posts">Klubopslag</span>
        </SectionTitle>
        {posts.length === 0 ? (
          <EmptyState icon="📣">Klubben har ikke delt noget endnu.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {posts.map((post) => (
                <li key={post.id} className="px-4 py-3">
                  <p className="line-clamp-2 text-sm">
                    {post.poll ? `🗳️ ${post.poll.question}` : (post.body ?? `📷 ${post._count.photos} billede${post._count.photos === 1 ? "" : "r"}`)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {post.author.name} · {stampLabel(post.createdAt)} · {post._count.teams} hold · {post._count.comments}{" "}
                    {post._count.comments === 1 ? "kommentar" : "kommentarer"}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="club-teams">
        <SectionTitle>
          <span id="club-teams">Klubbens hold</span>
        </SectionTitle>
        <Card>
          <ul className="flex flex-wrap gap-1.5">
            {teams.map((team) => (
              <li key={team.id}>
                <Badge>{team.name}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Klubadmins: {admins.map((a) => a.user.name).join(", ")}. Klubben ser ikke holdenes bøder, chat eller egne opslag og aktiviteter.
          </p>
        </Card>
      </section>
    </div>
  );
}
