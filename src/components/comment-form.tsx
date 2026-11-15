"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Avatar } from "@/components/photo";
import { addComment } from "@/app/actions/social";
import { activeMention, insertMention, suggestMembers } from "@/lib/mentions";

export type CommentMember = { userId: string; name: string; photoId: string | null };

/**
 * The box to comment in. Typing "@" offers the teammates whose names begin with what
 * follows; choosing one writes "@Name " into the words, and the server tags them.
 */
export function CommentForm({ postId, members, viewerId }: { postId: string; members: CommentMember[]; viewerId: string }) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { state, pending, handleSubmit } = useFormAction(addComment, {
    onSuccess: () => {
      setValue("");
      setCaret(0);
    },
  });

  const mention = activeMention(value, caret);
  const suggestions = mention && mention.start !== dismissed ? suggestMembers(mention.query, members, viewerId) : [];
  const open = suggestions.length > 0;
  const active = Math.min(highlight, suggestions.length - 1);

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
    <form onSubmit={handleSubmit} className="relative flex gap-2">
      {open && (
        <ul
          id={`mentions-${postId}`}
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
      <input type="hidden" name="postId" value={postId} />
      <input
        ref={input}
        name="body"
        maxLength={1000}
        placeholder="Skriv en kommentar… (@ for at tagge)"
        aria-label="Kommentar"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `mentions-${postId}` : undefined}
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
      {state?.ok === false && (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      )}
    </form>
  );
}
