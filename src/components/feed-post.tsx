import type { feedPosts } from "@/lib/feed";
import { reactorsOf } from "@/lib/reactions";
import { stampLabel } from "@/lib/time";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PostReactions } from "@/components/reactions";
import { PlayerLink } from "@/components/player-link";
import { PhotoCarousel } from "@/components/photo-carousel";
import { PollView } from "@/components/poll-view";
import { CommentsDrawer } from "@/components/comments-drawer";
import type { CommentMember } from "@/components/comment-form";
import { PostMenu, PostState } from "@/components/post-menu";

export type FeedPost = Awaited<ReturnType<typeof feedPosts>>[number];

/**
 * One post in the feed. Rendered on the server both for the first page and for each
 * page the feed fetches as it is scrolled (`loadFeedPosts`), so the two look the same.
 */
export function FeedPostCard({
  post,
  viewerId,
  admin,
  members,
}: {
  post: FeedPost;
  viewerId: string;
  admin: boolean;
  /** The team, for tagging in comments. */
  members: CommentMember[];
}) {
  const reactors = reactorsOf(post.reactions);
  return (
    <PostState>
      <Card padded={false}>
        <div className="flex items-center gap-3 px-4 py-3">
          <PlayerLink userId={post.author.id} press="icon" className="block shrink-0" aria-label={post.author.name}>
            <Avatar name={post.author.name} photoId={post.author.photoId} size="sm" />
          </PlayerLink>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <PlayerLink userId={post.author.id}>{post.author.name}</PlayerLink>
            </p>
            <p className="text-xs text-slate-500">
              {stampLabel(post.createdAt)}
              {post.editedAt && " · redigeret"}
            </p>
          </div>
          {post.pinnedAt && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              <span aria-hidden>📌 </span>Fastgjort
            </span>
          )}
          <PostMenu
            postId={post.id}
            body={post.body}
            photoIds={post.photoIds}
            pinned={post.pinnedAt !== null}
            canChange={post.author.id === viewerId || admin}
            poll={post.poll}
          />
        </div>
        {/* What the author wrote comes first, above pictures, poll, reactions and comments. */}
        {post.body && <p className="px-4 pb-3 text-sm whitespace-pre-line">{post.body}</p>}
        {post.photoIds.length > 0 && (
          <PhotoCarousel photoIds={post.photoIds} alt={post.body ?? `Billede fra ${post.author.name}`} />
        )}
        <div className="space-y-3 px-4 py-3">
          {post.poll && <PollView poll={post.poll} />}
          {/* The reactions in short above, then the bar: the crown button and the comments. */}
          <PostReactions target="post" id={post.id} reactors={reactors} viewerId={viewerId}>
            <CommentsDrawer
              postId={post.id}
              members={members}
              viewerId={viewerId}
              reactors={reactors}
              comments={post.comments.map((comment) => ({
                id: comment.id,
                parentId: comment.parentId,
                body: comment.body,
                stamp: stampLabel(comment.createdAt),
                author: { id: comment.author.id, name: comment.author.name, photoId: comment.author.photoId },
                canDelete: comment.author.id === viewerId || admin,
                reactors: reactorsOf(comment.reactions),
              }))}
            />
          </PostReactions>
        </div>
      </Card>
    </PostState>
  );
}
