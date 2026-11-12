import type { feedPosts } from "@/lib/feed";
import { stampLabel } from "@/lib/time";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PhotoCarousel } from "@/components/photo-carousel";
import { PollView } from "@/components/poll-view";
import { CommentForm } from "@/components/comment-form";
import { ActionButton } from "@/components/action-button";
import { deleteComment, deletePost, toggleLike } from "@/app/actions/social";

export type FeedPost = Awaited<ReturnType<typeof feedPosts>>[number];

/**
 * One post in the feed. Rendered on the server both for the first page and for each
 * page the feed fetches as it is scrolled (`loadFeedPosts`), so the two look the same.
 */
export function FeedPostCard({ post, viewerId, admin }: { post: FeedPost; viewerId: string; admin: boolean }) {
  const liked = post.likes.some((like) => like.userId === viewerId);
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={post.author.name} photoId={post.author.photoId} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{post.author.name}</p>
          <p className="text-xs text-slate-500">{stampLabel(post.createdAt)}</p>
        </div>
        {(post.author.id === viewerId || admin) && (
          <ActionButton
            action={deletePost}
            fields={{ id: post.id }}
            label="Slet"
            variant="ghost"
            confirm="Slet opslaget?"
            confirmLabel="Slet"
          />
        )}
      </div>
      {post.photoIds.length > 0 && (
        <PhotoCarousel photoIds={post.photoIds} alt={post.body ?? `Billede fra ${post.author.name}`} />
      )}
      <div className="space-y-3 px-4 py-3">
        {post.poll && <PollView poll={post.poll} />}
        <div className="flex items-center gap-3">
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
          {post.likes.length > 0 && (
            <p className="truncate text-xs text-slate-500">
              {post.likes
                .slice(0, 3)
                .map((like) => like.user.name.split(" ")[0])
                .join(", ")}
              {post.likes.length > 3 && ` og ${post.likes.length - 3} mere`}
            </p>
          )}
        </div>
        {post.body && <p className="text-sm whitespace-pre-line">{post.body}</p>}
        {post.comments.length > 0 && (
          <ul className="space-y-1.5 border-t border-slate-100 pt-3">
            {post.comments.map((comment) => (
              <li key={comment.id} className="group flex items-start gap-2 text-sm">
                <Avatar name={comment.author.name} photoId={comment.author.photoId} size="xs" />
                <p className="min-w-0 flex-1">
                  <strong className="font-medium">{comment.author.name}</strong> {comment.body}
                  <span className="ml-2 text-xs text-slate-400">{stampLabel(comment.createdAt)}</span>
                </p>
                {(comment.author.id === viewerId || admin) && (
                  <ActionButton action={deleteComment} fields={{ id: comment.id }} label="Slet" variant="ghost" className="px-1.5! py-0! text-xs" />
                )}
              </li>
            ))}
          </ul>
        )}
        <CommentForm postId={post.id} />
      </div>
    </Card>
  );
}
