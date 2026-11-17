"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { ReactionKind } from "@prisma/client";
import { react } from "@/app/actions/reactions";
import { REACTIONS, applyPress, nameList, type ReactionTarget, type ReactionView } from "@/lib/reactions";

/** The picker's size, to place it inside the screen. */
const PICKER_WIDTH = 264;
const PICKER_HEIGHT = 52;

/**
 * The reactions on one thing: each kind given as a small pill with its count — pressing
 * one gives it or takes yours back — and a button that opens the six to choose from.
 * The change shows at once and is sent after; it is undone if it is refused. `onChanged`
 * runs once it has been saved, for a list that fetches itself (the chat).
 */
export function Reactions({
  target,
  id,
  reactions,
  onChanged,
  align = "start",
  className = "",
}: {
  target: ReactionTarget;
  id: string;
  reactions: ReactionView[];
  onChanged?: () => void;
  align?: "start" | "end";
  className?: string;
}) {
  // What the server last sent, and the viewer's presses on top of it until it sends anew.
  const sent = JSON.stringify(reactions);
  const [state, setState] = useState({ sent, list: reactions });
  if (state.sent !== sent) setState({ sent, list: reactions });
  const list = state.list;
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function toggle(kind: ReactionKind) {
    setOpen(false);
    const before = list;
    const on = !before.some((r) => r.kind === kind && r.mine);
    setState((current) => ({ ...current, list: applyPress(current.list, kind, on) }));
    const data = new FormData();
    data.set("target", target);
    data.set("id", id);
    data.set("kind", kind);
    data.set("on", on ? "on" : "off");
    startTransition(async () => {
      const result = await react(undefined, data);
      if (result?.ok) onChanged?.();
      else setState((current) => ({ ...current, list: before }));
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${align === "end" ? "justify-end" : ""} ${className}`}>
      {list.map((reaction) => {
        const who = nameList(reaction.names);
        return (
          <button
            key={reaction.kind}
            type="button"
            onClick={() => toggle(reaction.kind)}
            aria-pressed={reaction.mine}
            aria-label={`${reaction.emoji} ${reaction.count}: ${who}`}
            title={who}
            className={`press-button flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs font-medium tabular-nums ${
              reaction.mine
                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent-text)]"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <span aria-hidden className="text-[13px] leading-none">
              {reaction.emoji}
            </span>
            {reaction.count}
          </button>
        );
      })}
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-label="Reager"
        aria-haspopup="true"
        aria-expanded={open}
        className="press-button flex h-6 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M20.5 12A8.5 8.5 0 1 1 12 3.5" />
          <path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01" />
          <path d="M19 2.5v5M16.5 5h5" />
        </svg>
      </button>
      {open && <Picker anchor={button} list={list} onPick={toggle} onClose={close} />}
    </div>
  );
}

/**
 * The six reactions in a row, laid over the page next to the button — above it where
 * there is room — so no list or drawer around it cuts it off. Pressing outside it, or
 * Escape, closes it and nothing else.
 */
function Picker({
  anchor,
  list,
  onPick,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  list: ReactionView[];
  onPick: (kind: ReactionKind) => void;
  onClose: () => void;
}) {
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Placed by the button, and kept there while the page moves under it — a chat that
    // scrolls to a new message, a drawer scrolled — until the button leaves the screen.
    function place() {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return onClose();
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - PICKER_WIDTH / 2), window.innerWidth - PICKER_WIDTH - 8);
      const top = rect.top - PICKER_HEIGHT - 8 >= 8 ? rect.top - PICKER_HEIGHT - 8 : rect.bottom + 8;
      setPlace({ top, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    box.current?.querySelector("button")?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={box}
      role="group"
      aria-label="Vælg en reaktion"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Closes the row, not the drawer it may sit in.
          event.preventDefault();
          event.stopPropagation();
          onClose();
          anchor.current?.focus();
        }
      }}
      style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, width: PICKER_WIDTH, height: PICKER_HEIGHT }}
      className="animate-pop fixed z-[70] flex items-center justify-between rounded-full bg-white px-2 shadow-xl ring-1 ring-slate-200"
    >
      {REACTIONS.map((reaction) => {
        const mine = list.some((r) => r.kind === reaction.kind && r.mine);
        return (
          <button
            key={reaction.kind}
            type="button"
            onClick={() => onPick(reaction.kind)}
            aria-label={`${reaction.label} ${reaction.emoji}`}
            aria-pressed={mine}
            title={reaction.label}
            className={`press-icon flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none ${mine ? "bg-slate-100" : ""}`}
          >
            <span aria-hidden>{reaction.emoji}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
