"use client";

import { useState } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { CommentForm, type CommentMember, type ReplyTarget } from "@/components/comment-form";
import { CommentThreads, type CommentView } from "@/components/comment-thread";
import { addComment, deleteComment } from "@/app/actions/social";

export type { CommentView };

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
            <CommentThreads comments={comments} members={members} onReply={setReplyTo} target="comment" onDelete={deleteComment} />
          )}
        </ModalBody>
        <ModalFooter>
          <CommentForm
            action={addComment}
            fields={{ postId }}
            members={members}
            viewerId={viewerId}
            replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={() => setReplyTo(null)} />
        </ModalFooter>
      </Modal>
    </>
  );
}
