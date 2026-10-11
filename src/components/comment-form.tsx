"use client";

import { useFormAction } from "@/components/use-form-action";
import { addComment } from "@/app/actions/social";

export function CommentForm({ postId }: { postId: string }) {
  const { state, pending, handleSubmit } = useFormAction(addComment, { onSuccess: (form) => form.reset() });
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input type="hidden" name="postId" value={postId} />
      <input
        name="body"
        maxLength={1000}
        placeholder="Skriv en kommentar…"
        aria-label="Kommentar"
        className="min-w-0 flex-1 rounded-full bg-slate-50 px-3.5 py-1.5 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[var(--accent)]"
        required
      />
      <button disabled={pending} className="press-button rounded-full px-3 text-sm font-medium text-[var(--accent-text)] disabled:opacity-50">
        Send
      </button>
      {state?.ok === false && (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      )}
    </form>
  );
}
