"use client";

import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { useTransition } from "react";
import { Holdable, type HoldAction } from "@/components/reactions";
import type { CommentMember, ReplyTarget } from "@/components/comment-form";
import { mentionSegments } from "@/lib/mentions";
import type { ReactionTarget, Reactor } from "@/lib/reactions";
import { possessive } from "@/lib/names";
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
  /** Who reacted to it, and with what. */
  reactors: Reactor[];
};

/**
 * Comments with their answers indented under the comment they answer. A comment is held
 * to react to it, answer it, copy it or — whoever may — delete it; under it are only its
 * time and the reactions it has. A feed post's comments and an activity's
 * look the same; `target` and `onDelete` say which they are.
 */
export function CommentThreads({
  comments,
  members,
  onReply,
  target,
  onDelete,
  viewerId,
}: {
  comments: CommentView[];
  members: CommentMember[];
  viewerId: string;
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
            <Comment comment={comment} members={members} onReply={onReply} target={target} onDelete={onDelete} viewerId={viewerId} />
            {replies.length > 0 && (
              <ul aria-label={`Svar til ${comment.author.name}`} className="mt-3 space-y-3 pl-10">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <Comment comment={reply} members={members} onReply={onReply} target={target} onDelete={onDelete} viewerId={viewerId} small />
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
  viewerId,
  small = false,
}: {
  comment: CommentView;
  members: CommentMember[];
  onReply: (to: ReplyTarget) => void;
  target: ReactionTarget;
  onDelete: DeleteAction;
  viewerId: string;
  small?: boolean;
}) {
  const [deleting, startDelete] = useTransition();
  const actions: HoldAction[] = [
    { label: "Svar", onSelect: () => onReply({ id: comment.id, name: comment.author.name }) },
    { label: "Kopiér tekst", onSelect: () => void navigator.clipboard?.writeText(comment.body).catch(() => {}) },
  ];
  if (comment.canDelete) {
    actions.push({
      label: "Slet",
      danger: true,
      onSelect: () => {
        const data = new FormData();
        data.set("id", comment.id);
        startDelete(async () => {
          await onDelete(undefined, data);
        });
      },
    });
  }

  return (
    <div className={`flex items-start gap-2.5 ${deleting ? "opacity-50" : ""}`}>
      <PlayerLink userId={comment.author.id} className="shrink-0" aria-label={comment.author.name}>
        <Avatar name={comment.author.name} photoId={comment.author.photoId} size={small ? "xs" : "sm"} />
      </PlayerLink>
      <Holdable
        target={target}
        id={comment.id}
        reactors={comment.reactors}
        viewerId={viewerId}
        label={`${possessive(comment.author.name)} kommentar`}
        actions={actions}
        className="min-w-0 flex-1"
        footer={(summary) => (
          <div className="mt-1 flex items-center gap-3 px-3 text-xs text-slate-500">
            <span>{comment.stamp}</span>
            {summary && <span className="ml-auto">{summary}</span>}
          </div>
        )}
      >
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
      </Holdable>
    </div>
  );
}
