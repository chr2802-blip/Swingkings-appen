"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Avatar } from "@/components/photo";
import type { ActionResult } from "@/lib/action-result";
import { activeMention, insertMention, suggestMembers, withReplyTag } from "@/lib/mentions";

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
  const input = useRef<HTMLTextAreaElement>(null);
  const { state, pending, handleSubmit } = useFormAction(action, {
    onSuccess: () => {
      tagged.current = null;
      setValue("");
      setCaret(0);
      setDismissed(null);
      onSent?.();
    },
  });
  // Answering a comment tags its writer first ("@Anna "), and puts the cursor after it,
  // ready to write; answering another swaps the tag, and cancelling takes it away.
  const tagged = useRef<string | null>(null);
  useEffect(() => {
    const to = replyTo?.name ?? null;
    if (to === tagged.current) return;
    const from = tagged.current;
    tagged.current = to;
    setValue((current) => {
      const next = withReplyTag(current, from, to);
      if (to) {
        requestAnimationFrame(() => {
          input.current?.focus();
          input.current?.setSelectionRange(next.length, next.length);
        });
      }
      setCaret(next.length);
      return next;
    });
  }, [replyTo]);

  // The box is as tall as its lines (up to max-h-40, then it scrolls), and shrinks back when sent.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const mention = activeMention(value, caret);
  const suggestions = mention && mention.start !== dismissed ? suggestMembers(mention.query, members, viewerId) : [];
  const open = suggestions.length > 0;
  const active = Math.min(highlight, suggestions.length - 1);
  const listId = `mentions-${Object.values(fields).join("-")}`;

  function track(element: HTMLTextAreaElement) {
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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
          <button type="button" onClick={onCancelReply} className="press-text tap-inline font-medium text-slate-500 underline-offset-2 hover:underline">
            Annuller
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {replyTo && <input type="hidden" name="parentId" value={replyTo.id} />}
        {/* Enter makes a new line; "Send" sends. Several lines are welcome. */}
        <textarea
          ref={input}
          name="body"
          rows={1}
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
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-slate-50 px-3.5 py-2.5 text-[15px] leading-snug outline-none focus:bg-white focus:ring-1 focus:ring-[var(--accent)]"
          required
        />
        <button disabled={pending} className="press-button h-11 rounded-full px-3 text-sm font-medium text-[var(--accent-text)] disabled:opacity-50">
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
