"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Avatar } from "@/components/photo";
import type { ActionResult } from "@/lib/action-result";
import { activeMention, insertMention, suggestMembers } from "@/lib/mentions";

/** Who is being answered, when the comment is an answer: the comment and its writer. */
export type ReplyTarget = { id: string; name: string };

export type CommentMember = { userId: string; name: string; photoId: string | null };

/**
 * The box to comment in, or to answer a comment in. Typing "@" offers the teammates
 * whose names begin with what follows; choosing one writes "@Name " into the words,
 * and the server tags them.
 */
export function CommentForm({
  action,
  fields,
  members,
  viewerId,
  replyTo = null,
  onCancelReply,
  onSent,
}: {
  /** What sends it: `addComment` for a post, `addActivityComment` for an activity. */
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** What it is on, sent along with the words (`postId`, `matchId`). */
  fields: Record<string, string>;
  members: CommentMember[];
  viewerId: string;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  onSent?: () => void;
}) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { state, pending, handleSubmit } = useFormAction(action, {
    onSuccess: () => {
      setValue("");
      setCaret(0);
      setDismissed(null);
      onSent?.();
    },
  });
  // Pressing "Svar" puts the cursor in the box, ready to write the answer.
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  const mention = activeMention(value, caret);
  const suggestions = mention && mention.start !== dismissed ? suggestMembers(mention.query, members, viewerId) : [];
  const open = suggestions.length > 0;
  const active = Math.min(highlight, suggestions.length - 1);
  const listId = `mentions-${Object.values(fields).join("-")}`;

  function track(element: HTMLInputElement) {
    setValue(element.value);
    setCaret(element.selectionStart ?? element.value.length);
    setHighlight(0);
  }

  function choose(member: CommentMember) {
    if (!mention) return;
    const next = insertMention(value, mention.start, caret, member.name);
    setValue(next.value);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(suggestions[active]!);
    } else if (event.key === "Escape") {
      // Closes the list, not the drawer around it.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(mention!.start);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative space-y-1.5">
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tag en holdkammerat"
          className="absolute right-0 bottom-full left-0 mb-2 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {suggestions.map((member, index) => (
            <li
              key={member.userId}
              role="option"
              aria-selected={index === active}
              // Pressing must not take the focus from the box, or the caret is lost.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(member)}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${index === active ? "bg-slate-100" : ""}`}
            >
              <span aria-hidden className="shrink-0">
                <Avatar name={member.name} photoId={member.photoId} size="sm" />
              </span>
              <span>{member.name}</span>
            </li>
          ))}
        </ul>
      )}
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
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {replyTo && <input type="hidden" name="parentId" value={replyTo.id} />}
        <input
          ref={input}
          name="body"
          maxLength={1000}
          placeholder={replyTo ? `Svar ${replyTo.name}…` : "Skriv en kommentar… (@ for at tagge)"}
          aria-label={replyTo ? "Svar" : "Kommentar"}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          value={value}
          onChange={(event) => track(event.currentTarget)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
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
