import type { TeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { FEED_PAGE, feedPosts, nextFeedCursor } from "@/lib/feed";
import { teamRoster } from "@/lib/roster";
import { EmptyState, SectionTitle } from "@/components/ui";
import { PostDialog } from "@/components/post-dialog";
import { FeedSeen } from "@/components/feed-seen";
import { FeedPostCard } from "@/components/feed-post";
import { FeedMore } from "@/components/feed-more";

/**
 * The team's feed — pictures, stories and polls — as a section of the front page, which
 * is where it lives (there is no feed tab). `#feed` is its address; push links go there.
 *
 * The first `FEED_PAGE` posts come with the page; `FeedMore` fetches the rest as the
 * reader scrolls towards the end.
 */
export async function TeamFeed({ user }: { user: TeamUser }) {
  const admin = canAdministerTeam(user, user.teamId);
  const [posts, roster] = await Promise.all([
    feedPosts(user.teamId, { id: user.id, canAdminister: admin }),
    teamRoster(user.teamId),
  ]);
  // Changes on every render, so the posts `FeedMore` fetched are fetched again when an
  // action (a like, a comment) has the page rendered anew.
  const renderedAt = Date.now();

  return (
    <section id="feed" className="mx-auto max-w-xl scroll-mt-24">
      <FeedSeen />
      <SectionTitle
        action={
          <PostDialog
            members={roster.map((m) => ({ userId: m.userId, name: m.name, photoId: m.photoId, shirtNumber: m.shirtNumber }))}
          />
        }
      >
        Feed
      </SectionTitle>
      {posts.length === 0 ? (
        <EmptyState icon="📸">Ingen opslag endnu. Del det første billede fra omklædningsrummet!</EmptyState>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <FeedPostCard key={post.id} post={post} viewerId={user.id} admin={admin} />
          ))}
          <FeedMore after={nextFeedCursor(posts, FEED_PAGE)} renderedAt={renderedAt} />
        </div>
      )}
    </section>
  );
}
