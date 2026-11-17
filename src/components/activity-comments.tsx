"use client";

import { useEffect, useState } from "react";
import { CommentForm, type CommentMember, type ReplyTarget } from "@/components/comment-form";
import { CommentThreads, type CommentView } from "@/components/comment-thread";
import { addActivityComment, deleteActivityComment } from "@/app/actions/activity-comments";

/** Where this phone remembers whether the comments are folded out. One choice for every activity. */
const OPEN_KEY = "activity-comments-open";

/** Folded together, this many of the latest comments still show. */
export const PREVIEW_COMMENTS = 2;

/**
 * An activity's comments, in the same card as its details (the card draws the frame;
 * this is its lower half). Folded together — as it starts — it shows
 * the latest few and "Vis alle"; folded out, every comment with its answers. Either way
 * the box to write in is at the foot. The phone remembers which way it was left.
 */
export function ActivityComments({
  matchId,
  comments,
  members,
  viewerId,
}: {
  matchId: string;
  comments: CommentView[];
  members: CommentMember[];
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  // Read after the first render, so the server's page and the phone's agree until then.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      // No storage (a private window): it starts folded together.
    }
  }, []);

  function fold(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // Remembered for this visit only.
    }
  }

  const count = comments.length;
  const hidden = open ? 0 : Math.max(0, count - PREVIEW_COMMENTS);
  // Folded together: the latest few, each shown on its own (an answer without the comment it answers).
  const shown = open ? comments : comments.slice(-PREVIEW_COMMENTS).map((c) => ({ ...c, parentId: null }));
  const listId = `activity-comments-${matchId}`;

  return (
    <section aria-labelledby="activity-comments-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="activity-comments-title" className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Kommentarer ({count})
        </h2>
        {count > PREVIEW_COMMENTS && (
          <button
            type="button"
            onClick={() => fold(!open)}
            aria-expanded={open}
            aria-controls={listId}
            className="press-button rounded-lg px-1 text-xs font-semibold text-[var(--accent-text)]"
          >
            {open ? "Skjul ældre" : `Vis alle ${count}`}
          </button>
        )}
      </div>
      <div id={listId}>
        {count === 0 ? (
          <p className="text-sm text-slate-500">Ingen kommentarer endnu. Skriv den første!</p>
        ) : (
          <>
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => fold(true)}
                className="press-button mb-3 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {hidden === 1 ? "Se 1 tidligere kommentar" : `Se ${hidden} tidligere kommentarer`}
              </button>
            )}
            <CommentThreads
              comments={shown}
              members={members}
              onReply={(to) => {
                setReplyTo(to);
                // Shown whole while answering, without changing what the phone remembers.
                setOpen(true);
              }}
              target="activityComment"
              onDelete={deleteActivityComment}
              viewerId={viewerId}
            />
          </>
        )}
      </div>
      <CommentForm
        action={addActivityComment}
        fields={{ matchId }}
        members={members}
        viewerId={viewerId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSent={() => setReplyTo(null)}
      />
    </section>
  );
}
