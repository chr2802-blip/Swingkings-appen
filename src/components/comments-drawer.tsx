"use client";

import { useState } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { CommentForm, type CommentMember, type ReplyTarget } from "@/components/comment-form";
import { mentionSegments } from "@/lib/mentions";
import { deleteComment } from "@/app/actions/social";

export type CommentView = {
  id: string;
  /** The comment this one answers; null for a comment on the post itself. */
  parentId: string | null;
  body: string;
  /** Already written out on the server, in Copenhagen time. */
  stamp: string;
  author: { id: string; name: string; photoId: string | null };
  canDelete: boolean;
};

/**
 * A post's comments, the Facebook way: the card shows only a 💬 and the count, and the
 * comments open in a drawer from the bottom with the box to write in at its foot.
 * Answers sit indented under the comment they answer; "Svar" turns the box into an answer.
 * The drawer stays open while comments are added or deleted, as the page renders anew.
 */
export function CommentsDrawer({
  postId,
  comments,
  members,
  viewerId,
}: {
  postId: string;
  comments: CommentView[];
  /** The team, to tag in a comment and to make the tagged names links. */
  members: CommentMember[];
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const count = comments.length;
  const threads = comments.filter((c) => !c.parentId || !comments.some((p) => p.id === c.parentId));
  const repliesTo = (id: string) => comments.filter((c) => c.parentId === id);

  function close() {
    setOpen(false);
    setReplyTo(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count === 1 ? "1 kommentar" : `${count} kommentarer`}
        className="press-button flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 20c4.97 0 9-3.58 9-8s-4.03-8-9-8-9 3.58-9 8c0 1.9.74 3.64 1.98 5.01L4 21l4.2-1.73c1.17.47 2.46.73 3.8.73z" strokeLinejoin="round" />
        </svg>
        {count > 0 && count}
      </button>
      <Modal open={open} onClose={close} title="Kommentarer" size="drawer">
        <ModalBody>
          {count === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Ingen kommentarer endnu. Skriv den første!</p>
          ) : (
            <ul aria-label="Kommentarer" className="space-y-4">
              {threads.map((comment) => {
                const replies = repliesTo(comment.id);
                return (
                  <li key={comment.id}>
                    <Comment comment={comment} members={members} onReply={setReplyTo} />
                    {replies.length > 0 && (
                      <ul aria-label={`Svar til ${comment.author.name}`} className="mt-3 space-y-3 pl-10">
                        {replies.map((reply) => (
                          <li key={reply.id}>
                            <Comment comment={reply} members={members} onReply={setReplyTo} small />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <CommentForm
            postId={postId}
            members={members}
            viewerId={viewerId}
            replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={() => setReplyTo(null)} />
        </ModalFooter>
      </Modal>
    </>
  );
}

function Comment({
  comment,
  members,
  onReply,
  small = false,
}: {
  comment: CommentView;
  members: CommentMember[];
  onReply: (to: ReplyTarget) => void;
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
        <div className="mt-1 flex items-center gap-3 px-3 text-xs text-slate-500">
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
              action={deleteComment}
              fields={{ id: comment.id }}
              label="Slet"
              variant="ghost"
              className="px-0! py-0! text-xs font-medium text-slate-500!"
            />
          )}
        </div>
      </div>
    </div>
  );
}
