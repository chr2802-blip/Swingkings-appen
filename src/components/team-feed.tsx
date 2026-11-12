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
 * What the feed shows, read alongside the rest of the front page's data so it adds no
 * wait of its own.
 */
export async function teamFeedData(user: TeamUser) {
  const admin = canAdministerTeam(user, user.teamId);
  const [posts, roster] = await Promise.all([
    feedPosts(user.teamId, { id: user.id, canAdminister: admin }),
    teamRoster(user.teamId),
  ]);
  return { admin, posts, roster };
}

/**
 * The team's feed — pictures, stories and polls — as a section of the front page, which
 * is where it lives (there is no feed tab). `#feed` is its address; push links go there.
 *
 * The first `FEED_PAGE` posts come with the page; `FeedMore` fetches the rest as the
 * reader scrolls towards the end.
 *
 * Not behind a `<Suspense>`: with the feed streamed in, an action that renders the front
 * page anew (a vote, a comment) pressed in the first moment after it opened could leave
 * its button pending and the page unchanged for good. The poll test in
 * `e2e/feed-chat.spec.ts` votes straight away.
 */
export function TeamFeed({ user, data }: { user: TeamUser; data: Awaited<ReturnType<typeof teamFeedData>> }) {
  const { admin, posts, roster } = data;
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
