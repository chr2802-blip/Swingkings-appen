import type { TeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { feedPosts } from "@/lib/feed";
import { matchOptions } from "@/lib/fine-data";
import { stampLabel } from "@/lib/time";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PhotoCarousel } from "@/components/photo-carousel";
import { PollView } from "@/components/poll-view";
import { PostDialog } from "@/components/post-dialog";
import { CommentForm } from "@/components/comment-form";
import { ActionButton } from "@/components/action-button";
import { deleteComment, deletePost, toggleLike } from "@/app/actions/social";

/**
 * The team's feed — pictures, stories and polls — as a section of the front page, which
 * is where it lives (there is no feed tab). `#feed` is its address; push links go there.
 */
export async function TeamFeed({ user }: { user: TeamUser }) {
  const admin = canAdministerTeam(user, user.teamId);
  const [posts, matches] = await Promise.all([
    feedPosts(user.teamId, { id: user.id, canAdminister: admin }),
    matchOptions(user.teamId),
  ]);

  return (
    <section id="feed" className="mx-auto max-w-xl scroll-mt-24">
      <SectionTitle
        action={
          <div className="flex gap-2">
            <PostDialog matches={matches} />
          </div>
        }
      >
        Feed
      </SectionTitle>
      {posts.length === 0 ? (
        <EmptyState icon="📸">Ingen opslag endnu. Del det første billede fra omklædningsrummet!</EmptyState>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => {
            const liked = post.likes.some((like) => like.userId === user.id);
            return (
              <Card key={post.id} padded={false} className="overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={post.author.name} photoId={post.author.photoId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{post.author.name}</p>
                    <p className="text-xs text-slate-500">{stampLabel(post.createdAt)}</p>
                  </div>
                  {(post.author.id === user.id || admin) && (
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
                          {(comment.author.id === user.id || admin) && (
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
          })}
        </div>
      )}
    </section>
  );
}
