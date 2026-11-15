"use client";

import { useEffect, useRef } from "react";
import { useFormAction } from "@/components/use-form-action";
import { addComment } from "@/app/actions/social";

/** Who is being answered, when the comment is an answer: the comment and its writer. */
export type ReplyTarget = { id: string; name: string };

export function CommentForm({
  postId,
  replyTo = null,
  onCancelReply,
  onSent,
}: {
  postId: string;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  onSent?: () => void;
}) {
  const { state, pending, handleSubmit } = useFormAction(addComment, {
    onSuccess: (form) => {
      form.reset();
      onSent?.();
    },
  });
  const input = useRef<HTMLInputElement>(null);
  // Pressing "Svar" puts the cursor in the box, ready to write the answer.
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      {replyTo && (
        <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
          <span>
            Svarer <span className="font-semibold text-slate-700">{replyTo.name}</span>
          </span>
          <button type="button" onClick={onCancelReply} className="font-medium text-slate-500 underline-offset-2 hover:underline">
            Annuller
          </button>
        </p>
      )}
      <div className="flex gap-2">
        <input type="hidden" name="postId" value={postId} />
        {replyTo && <input type="hidden" name="parentId" value={replyTo.id} />}
        <input
          ref={input}
          name="body"
          maxLength={1000}
          placeholder={replyTo ? `Svar ${replyTo.name}…` : "Skriv en kommentar…"}
          aria-label={replyTo ? "Svar" : "Kommentar"}
          className="min-w-0 flex-1 rounded-full bg-slate-50 px-3.5 py-1.5 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[var(--accent)]"
          required
        />
        <button disabled={pending} className="press-button rounded-full px-3 text-sm font-medium text-[var(--accent-text)] disabled:opacity-50">
          Send
        </button>
      </div>
      {state?.ok === false && (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      )}
    </form>
  );
}
