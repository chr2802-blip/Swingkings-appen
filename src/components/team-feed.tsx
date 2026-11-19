import { clubOnScreen, type TeamUser } from "@/lib/auth";
import { canAdministerClub, canAdministerTeam } from "@/lib/access";
import { FEED_PAGE, nextFeedCursor, teamFeed } from "@/lib/feed";
import { EmptyState, SectionTitle } from "@/components/ui";
import { PostDialog } from "@/components/post-dialog";
import { CreateAction } from "@/components/create-button";
import { FeedSeen } from "@/components/feed-seen";
import { FeedPostCard } from "@/components/feed-post";
import { FeedMore } from "@/components/feed-more";
import { FeedSearch } from "@/components/feed-search";

/**
 * The team's feed — pictures, stories and polls — as a section of the front page, which
 * is where it lives (there is no feed tab). `#feed` is its address; push links go there.
 *
 * The first `FEED_PAGE` posts come with the page; `FeedMore` fetches the rest as the
 * reader scrolls towards the end. `FeedSearch` puts a search beside the heading.
 */
export async function TeamFeed({ user }: { user: TeamUser }) {
  const admin = canAdministerTeam(user, user.teamId);
  const clubAdmin = canAdministerClub(user, clubOnScreen(user));
  const [posts, roster] = await teamFeed(user.teamId, user.id, admin, clubAdmin);
  const members = roster.map((m) => ({ userId: m.userId, name: m.name, photoId: m.photoId }));
  // Changes on every render, so the posts `FeedMore` fetched are fetched again when an
  // action (a like, a comment) has the page rendered anew.
  const renderedAt = Date.now();

  return (
    <section id="feed" className="mx-auto max-w-xl scroll-mt-24">
      <FeedSeen />
      <CreateAction>
        <PostDialog
          members={roster.map((m) => ({ userId: m.userId, name: m.name, photoId: m.photoId, shirtNumber: m.shirtNumber }))}
        />
      </CreateAction>
      {posts.length === 0 ? (
        <>
          <SectionTitle>Feed</SectionTitle>
          <EmptyState icon="📸">Ingen opslag endnu. Del det første billede fra omklædningsrummet!</EmptyState>
        </>
      ) : (
        <FeedSearch renderedAt={renderedAt}>
          <div className="space-y-6">
            {posts.map((post) => (
              <FeedPostCard key={post.id} post={post} viewerId={user.id} admin={admin} clubAdmin={clubAdmin} members={members} />
            ))}
            <FeedMore after={nextFeedCursor(posts, FEED_PAGE)} renderedAt={renderedAt} />
          </div>
        </FeedSearch>
      )}
    </section>
  );
}
