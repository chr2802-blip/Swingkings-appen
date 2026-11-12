"use client";

import { useState } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { Avatar } from "@/components/photo";
import { ActionButton } from "@/components/action-button";
import { CommentForm } from "@/components/comment-form";
import { deleteComment } from "@/app/actions/social";

export type CommentView = {
  id: string;
  body: string;
  /** Already written out on the server, in Copenhagen time. */
  stamp: string;
  author: { name: string; photoId: string | null };
  canDelete: boolean;
};

/**
 * A post's comments, the Facebook way: the card shows only a 💬 and the count, and the
 * comments open in a drawer from the bottom with the box to write in at its foot.
 * The drawer stays open while comments are added or deleted, as the page renders anew.
 */
export function CommentsDrawer({ postId, comments }: { postId: string; comments: CommentView[] }) {
  const [open, setOpen] = useState(false);
  const count = comments.length;

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
      <Modal open={open} onClose={() => setOpen(false)} title="Kommentarer" size="drawer">
        <ModalBody>
          {count === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Ingen kommentarer endnu. Skriv den første!</p>
          ) : (
            <ul aria-label="Kommentarer" className="space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2.5">
                  <Avatar name={comment.author.name} photoId={comment.author.photoId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="w-fit max-w-full rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2">
                      <p className="text-[13px] font-semibold">{comment.author.name}</p>
                      <p className="text-sm break-words whitespace-pre-line">{comment.body}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-3 px-3 text-xs text-slate-500">
                      <span>{comment.stamp}</span>
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
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <CommentForm postId={postId} />
        </ModalFooter>
      </Modal>
    </>
  );
}
