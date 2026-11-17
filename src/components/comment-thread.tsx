"use client";

import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { Reactions } from "@/components/reactions";
import type { CommentMember, ReplyTarget } from "@/components/comment-form";
import { mentionSegments } from "@/lib/mentions";
import type { ReactionTarget, ReactionView } from "@/lib/reactions";
import type { ActionResult } from "@/lib/action-result";

type DeleteAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export type CommentView = {
  id: string;
  /** The comment this one answers; null for a comment on the post itself. */
  parentId: string | null;
  body: string;
  /** Already written out on the server, in Copenhagen time. */
  stamp: string;
  author: { id: string; name: string; photoId: string | null };
  canDelete: boolean;
  /** The reactions on it, as the viewer sees them. */
  reactions: ReactionView[];
};

/**
 * Comments with their answers indented under the comment they answer, each with "Svar",
 * "Slet" for whoever may, and its reactions. A feed post's comments and an activity's
 * look the same; `target` and `onDelete` say which they are.
 */
export function CommentThreads({
  comments,
  members,
  onReply,
  target,
  onDelete,
}: {
  comments: CommentView[];
  members: CommentMember[];
  onReply: (to: ReplyTarget) => void;
  target: ReactionTarget;
  onDelete: DeleteAction;
}) {
  const threads = comments.filter((c) => !c.parentId || !comments.some((p) => p.id === c.parentId));
  const repliesTo = (id: string) => comments.filter((c) => c.parentId === id);
  return (
    <ul aria-label="Kommentarer" className="space-y-4">
      {threads.map((comment) => {
        const replies = repliesTo(comment.id);
        return (
          <li key={comment.id}>
            <Comment comment={comment} members={members} onReply={onReply} target={target} onDelete={onDelete} />
            {replies.length > 0 && (
              <ul aria-label={`Svar til ${comment.author.name}`} className="mt-3 space-y-3 pl-10">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <Comment comment={reply} members={members} onReply={onReply} target={target} onDelete={onDelete} small />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Comment({
  comment,
  members,
  onReply,
  target,
  onDelete,
  small = false,
}: {
  comment: CommentView;
  members: CommentMember[];
  onReply: (to: ReplyTarget) => void;
  target: ReactionTarget;
  onDelete: DeleteAction;
  small?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <PlayerLink userId={comment.author.id} className="shrink-0" aria-label={comment.author.name}>
        <Avatar name={comment.author.name} photoId={comment.author.photoId} size={small ? "xs" : "sm"} />
      </PlayerLink>
      <div className="min-w-0 flex-1">
        <div className="w-fit max-w-full rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2">
          <p className="text-[13px] font-semibold">
            <PlayerLink userId={comment.author.id}>{comment.author.name}</PlayerLink>
          </p>
          <p className="text-sm break-words whitespace-pre-line">
            {mentionSegments(comment.body, members).map((segment, index) =>
              segment.userId ? (
                <PlayerLink key={index} userId={segment.userId} className="font-semibold text-[var(--accent-text)]">
                  {segment.text}
                </PlayerLink>
              ) : (
                segment.text
              ),
            )}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-xs text-slate-500">
          <span>{comment.stamp}</span>
          <button
            type="button"
            onClick={() => onReply({ id: comment.id, name: comment.author.name })}
            aria-label={`Svar ${comment.author.name}`}
            className="font-medium text-slate-500 hover:text-slate-700"
          >
            Svar
          </button>
          {comment.canDelete && (
            <ActionButton
              action={onDelete}
              fields={{ id: comment.id }}
              label="Slet"
              variant="ghost"
              className="px-0! py-0! text-xs font-medium text-slate-500!"
            />
          )}
          <Reactions target={target} id={comment.id} reactions={comment.reactions} className="-my-0.5" />
        </div>
      </div>
    </div>
  );
}
