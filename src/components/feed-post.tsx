import { likersView, type feedPosts } from "@/lib/feed";
import { stampLabel } from "@/lib/time";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { PhotoCarousel } from "@/components/photo-carousel";
import { PollView } from "@/components/poll-view";
import { CommentsDrawer } from "@/components/comments-drawer";
import { ActionButton } from "@/components/action-button";
import { PostMenu, PostState } from "@/components/post-menu";
import { toggleLike } from "@/app/actions/social";

export type FeedPost = Awaited<ReturnType<typeof feedPosts>>[number];

/**
 * One post in the feed. Rendered on the server both for the first page and for each
 * page the feed fetches as it is scrolled (`loadFeedPosts`), so the two look the same.
 */
export function FeedPostCard({ post, viewerId, admin }: { post: FeedPost; viewerId: string; admin: boolean }) {
  const liked = post.likes.some((like) => like.userId === viewerId);
  const likers = likersView(post.likes);
  return (
    <PostState>
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <PlayerLink userId={post.author.id} className="shrink-0" aria-label={post.author.name}>
            <Avatar name={post.author.name} photoId={post.author.photoId} size="sm" />
          </PlayerLink>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <PlayerLink userId={post.author.id}>{post.author.name}</PlayerLink>
            </p>
            <p className="text-xs text-slate-500">{stampLabel(post.createdAt)}</p>
          </div>
          <PostMenu postId={post.id} canDelete={post.author.id === viewerId || admin} poll={post.poll} />
        </div>
        {/* What the author wrote comes first, above pictures, poll, likes and comments. */}
        {post.body && <p className="px-4 pb-3 text-sm whitespace-pre-line">{post.body}</p>}
        {post.photoIds.length > 0 && (
          <PhotoCarousel photoIds={post.photoIds} alt={post.body ?? `Billede fra ${post.author.name}`} />
        )}
        <div className="space-y-3 px-4 py-3">
          {post.poll && <PollView poll={post.poll} />}
          <div className="flex items-center gap-1">
            <ActionButton
              action={toggleLike}
              fields={{ postId: post.id }}
              variant="ghost"
              className="-ml-2"
              label={
                <span className={`flex items-center gap-1.5 ${liked ? "text-red-600" : ""}`}>
                  <svg viewBox="0 0 24 24" className={`h-5 w-5 ${liked ? "animate-pop" : ""}`} fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.3 3.2 5 6.4 5c2 0 3.3 1.1 4 2.3h3.2C14.3 6.1 15.6 5 17.6 5c3.2 0 5.1 3.3 3.6 6.4C19 15.6 12 20 12 20z" strokeLinejoin="round" />
                  </svg>
                  {post.likes.length > 0 && post.likes.length}
                  <span className="sr-only">{liked ? "Fjern like" : "Like"}</span>
                </span>
              }
            />
            <CommentsDrawer
              postId={post.id}
              comments={post.comments.map((comment) => ({
                id: comment.id,
                body: comment.body,
                stamp: stampLabel(comment.createdAt),
                author: { id: comment.author.id, name: comment.author.name, photoId: comment.author.photoId },
                canDelete: comment.author.id === viewerId || admin,
              }))}
            />
            {/* Who liked it, as overlapping faces; the names are read out and shown on hover. */}
            {likers.faces.length > 0 && (
              <div role="img" aria-label={likers.label} title={likers.label} className="ml-auto flex shrink-0 items-center pl-2">
                {likers.faces.map((like) => (
                  <Avatar
                    key={like.userId}
                    name={like.user.name}
                    photoId={like.user.photoId}
                    size="xs"
                    className="-ml-1.5 ring-2 ring-white first:ml-0"
                  />
                ))}
                {likers.more > 0 && <span className="ml-1.5 text-xs text-slate-500">+{likers.more}</span>}
              </div>
            )}
          </div>
        </div>
      </Card>
    </PostState>
  );
}
