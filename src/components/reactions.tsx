"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { ReactionKind } from "@prisma/client";
import { react } from "@/app/actions/reactions";
import { Crown } from "@/components/crest";
import { DEFAULT_REACTION, REACTIONS, applyPress, myReaction, nameList, type ReactionTarget, type ReactionView } from "@/lib/reactions";

/** The picker's size, to place it inside the screen: seven reactions of 40px and its padding. */
const PICKER_WIDTH = 300;
const PICKER_HEIGHT = 52;
/** How long a press is held before the other reactions come up. */
export const HOLD_MS = 450;

/** A reaction as it is drawn: the crest's crown, or the emoji. */
export function ReactionGlyph({ kind, size = "sm" }: { kind: ReactionKind; size?: "sm" | "md" | "lg" }) {
  if (kind === "CROWN") {
    return <Crown className={size === "lg" ? "h-7 w-7" : size === "md" ? "h-5 w-5" : "h-4 w-4"} />;
  }
  const emoji = REACTIONS.find((r) => r.kind === kind)!.emoji;
  return (
    <span aria-hidden className={`leading-none ${size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-[13px]"}`}>
      {emoji}
    </span>
  );
}

/**
 * The reactions on one thing. The button gives a crown — the crest's — or, when the viewer
 * has reacted, takes their reaction back; held, it brings up all of them to choose one,
 * which takes the place of whatever the viewer had. Beside it, each kind given as a small
 * pill with its count; pressing one makes it yours, or takes it back if it is.
 *
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
  const mine = myReaction(list);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; held: boolean }>({ timer: null, held: false });

  function choose(kind: ReactionKind, on: boolean) {
    setOpen(false);
    const before = list;
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

  /** A kind pressed in the row or on a pill: yours if it was not, taken back if it was. */
  const toggle = (kind: ReactionKind) => choose(kind, mine !== kind);

  function startHold() {
    hold.current.held = false;
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = setTimeout(() => {
      hold.current.held = true;
      hold.current.timer = null;
      navigator.vibrate?.(10);
      setOpen(true);
    }, HOLD_MS);
  }
  function endHold() {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  }
  useEffect(() => {
    const timers = hold.current;
    return () => {
      if (timers.timer) clearTimeout(timers.timer);
    };
  }, []);

  const mineMeta = mine && REACTIONS.find((r) => r.kind === mine)!;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${align === "end" ? "justify-end" : ""} ${className}`}>
      <button
        ref={button}
        type="button"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        // A long press on a phone, or a right click, opens the row instead of a menu.
        onContextMenu={(event) => {
          event.preventDefault();
          endHold();
          hold.current.held = true;
          setOpen(true);
        }}
        onClick={() => {
          // The press that opened the row is not also a crown.
          if (hold.current.held) {
            hold.current.held = false;
            return;
          }
          if (mine) choose(mine, false);
          else choose(DEFAULT_REACTION, true);
        }}
        onKeyDown={(event) => {
          // From the keyboard, arrow up brings up the row.
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-label={mineMeta ? `Fjern din reaktion (${mineMeta.label} ${mineMeta.emoji})` : "Giv en krone 👑"}
        aria-pressed={mine !== null}
        aria-haspopup="true"
        aria-expanded={open}
        title="Tryk for en krone – hold for flere"
        style={{ WebkitTouchCallout: "none" }}
        className={`press-button flex h-7 min-w-8 touch-manipulation items-center justify-center rounded-full px-1.5 select-none ${
          mine ? "bg-[color-mix(in_srgb,var(--gold)_22%,white)]" : "text-slate-400 hover:bg-slate-100"
        }`}
      >
        {mine ? <ReactionGlyph kind={mine} size="md" /> : <CrownOutline />}
      </button>
      {/* For a keyboard or a screen reader: the row without holding. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Vælg en anden reaktion"
        className="sr-only focus:not-sr-only focus:rounded-full focus:px-2 focus:text-xs focus:text-slate-600"
      >
        Flere
      </button>
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
            <ReactionGlyph kind={reaction.kind} />
            {reaction.count}
          </button>
        );
      })}
      {open && <Picker anchor={button} list={list} onPick={toggle} onClose={close} />}
    </div>
  );
}

/** The crown before anybody here has reacted: an outline, to be pressed. */
function CrownOutline() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 6.5 7.5 12 12 3l4.5 9L21 6.5 19 20H5L3 6.5Z" />
    </svg>
  );
}

/**
 * Every reaction in a row, laid over the page next to the button — above it where
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
    // Kept by the button every frame while open — a drawer still sliding up, a chat that
    // scrolls to a new message — and inside the screen. Only scrolling the button out of
    // sight closes it; a button that has not slid into sight yet does not.
    function place() {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - PICKER_WIDTH / 2), window.innerWidth - PICKER_WIDTH - 8);
      const above = rect.top - PICKER_HEIGHT - 8;
      const top = Math.min(above >= 8 ? above : rect.bottom + 8, window.innerHeight - PICKER_HEIGHT - 8);
      setPlace((was) => (was && was.top === top && was.left === left ? was : { top, left }));
    }
    function scrolled() {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect && (rect.bottom < 0 || rect.top > window.innerHeight)) onClose();
    }
    let frame = requestAnimationFrame(function follow() {
      place();
      frame = requestAnimationFrame(follow);
    });
    place();
    window.addEventListener("scroll", scrolled, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scrolled, true);
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
            <ReactionGlyph kind={reaction.kind} size="lg" />
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
