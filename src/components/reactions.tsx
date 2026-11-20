"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { ReactionKind } from "@prisma/client";
import { react } from "@/app/actions/reactions";
import { ReactionGlyph } from "@/components/reaction-glyph";
import { ReactorsDrawer } from "@/components/reactors-drawer";
import { DEFAULT_REACTION, REACTIONS, pressReaction, reactorsLabel, tallyReactions, type Reactor, type ReactionTarget } from "@/lib/reactions";

export { ReactionGlyph };

/** How long a press is held before the reactions (and, on a comment, what else can be done) come up. */
export const HOLD_MS = 450;
/** A finger that moves this far is scrolling, not holding. */
const HOLD_SLOP_PX = 10;
/** The menu's width: seven reactions of 40px and its padding. */
const MENU_WIDTH = 300;

type Thing = { target: ReactionTarget; id: string; reactors: Reactor[]; viewerId: string; onChanged?: () => void };

/**
 * Who reacted to one thing, with the viewer's presses on top until the server sends anew.
 * A choice shows at once and is sent after; it is undone if it is refused. `onChanged`
 * runs once it has been saved, for a list that fetches itself (the chat).
 */
function useReactions({ target, id, reactors, viewerId, onChanged }: Thing) {
  const sent = JSON.stringify(reactors);
  const [state, setState] = useState({ sent, list: reactors });
  if (state.sent !== sent) setState({ sent, list: reactors });
  const list = state.list;
  const tally = tallyReactions(list, viewerId);
  const [, startTransition] = useTransition();

  function choose(kind: ReactionKind, on: boolean) {
    const before = list;
    setState((current) => ({ ...current, list: pressReaction(current.list, viewerId, kind, on) }));
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

  /** A kind chosen in the row: yours, or taken back if it already was. */
  const toggle = (kind: ReactionKind) => choose(kind, tally.mine !== kind);
  return { list, tally, choose, toggle };
}

/**
 * A press held for `HOLD_MS` calls `onHold` — or a right click, or a long press that the
 * phone turns into a context menu. The click that ends a hold is swallowed (`guard`), so
 * holding a picture does not also open it. A finger that moves is scrolling and holds nothing.
 */
function useHold(onHold: () => void) {
  const state = useRef<{ timer: ReturnType<typeof setTimeout> | null; held: boolean; x: number; y: number }>({ timer: null, held: false, x: 0, y: 0 });
  const stop = useCallback(() => {
    if (state.current.timer) clearTimeout(state.current.timer);
    state.current.timer = null;
  }, []);
  useEffect(() => {
    return stop;
  }, [stop]);

  const handlers = {
    onPointerDown(event: React.PointerEvent) {
      if (event.button !== 0) return;
      stop();
      state.current.held = false;
      state.current.x = event.clientX;
      state.current.y = event.clientY;
      state.current.timer = setTimeout(() => {
        state.current.timer = null;
        state.current.held = true;
        navigator.vibrate?.(10);
        onHold();
      }, HOLD_MS);
    },
    onPointerMove(event: React.PointerEvent) {
      if (Math.hypot(event.clientX - state.current.x, event.clientY - state.current.y) > HOLD_SLOP_PX) stop();
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu(event: React.MouseEvent) {
      event.preventDefault();
      stop();
      state.current.held = true;
      onHold();
    },
  };
  /** True — once — when the click about to happen ends a hold. */
  function held() {
    const was = state.current.held;
    state.current.held = false;
    return was;
  }
  return { handlers, held };
}

/** Something to do with a comment or message, offered under the reactions when it is held. */
export type HoldAction = { label: string; onSelect: () => void; danger?: boolean };

/**
 * The reactions in a row — the crown first — and, held on a comment or message, what else
 * can be done with it below them. Laid over the page beside what was held, above it where
 * there is room, and kept there every frame while open (a drawer still sliding up, a chat
 * that scrolls); scrolling it out of sight closes it. Pressing outside, or Escape, closes
 * it and nothing else.
 */
function ReactionMenu({
  anchor,
  mine,
  onPick,
  actions = [],
  onClose,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  mine: ReactionKind | null;
  onPick: (kind: ReactionKind) => void;
  actions?: HoldAction[];
  onClose: () => void;
}) {
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function placeIt() {
      const rect = anchor.current?.getBoundingClientRect();
      const height = box.current?.offsetHeight ?? 52;
      if (!rect) return;
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - MENU_WIDTH / 2), window.innerWidth - MENU_WIDTH - 8);
      const above = rect.top - height - 8;
      const top = Math.max(8, Math.min(above >= 8 ? above : rect.bottom + 8, window.innerHeight - height - 8));
      setPlace((was) => (was && was.top === top && was.left === left ? was : { top, left }));
    }
    function scrolled() {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect && (rect.bottom < 0 || rect.top > window.innerHeight)) onClose();
    }
    let frame = requestAnimationFrame(function follow() {
      placeIt();
      frame = requestAnimationFrame(follow);
    });
    placeIt();
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
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Closes the menu, not the drawer it may sit in.
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, width: MENU_WIDTH }}
      className="animate-pop fixed z-[70] overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200"
    >
      <div role="group" aria-label="Vælg en reaktion" className="flex h-[52px] items-center justify-between px-2">
        {REACTIONS.map((reaction) => (
          <button
            key={reaction.kind}
            type="button"
            onClick={() => onPick(reaction.kind)}
            aria-label={`${reaction.label} ${reaction.emoji}`}
            aria-pressed={mine === reaction.kind}
            title={reaction.label}
            className={`press-icon flex h-10 w-10 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${mine === reaction.kind ? "bg-slate-100" : ""}`}
          >
            <ReactionGlyph kind={reaction.kind} size="lg" />
          </button>
        ))}
      </div>
      {actions.length > 0 && (
        <div role="group" aria-label="Handlinger" className="border-t border-slate-100 py-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onClose();
                action.onSelect();
              }}
              className={`press-card block w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-slate-50 ${action.danger ? "text-red-600" : "text-slate-800"}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * The reactions on a thing in short. Small (a comment, a chat bubble): the kind most given,
 * then how many reacted. `stacked` (a post's bar, as on Facebook): every kind given, most
 * first, drawn overlapping — the number stands on the reaction button instead. Pressing it
 * lists who, by kind (`ReactorsDrawer`). Nothing when nobody has reacted.
 */
export function ReactionSummary({ reactors, small = false, stacked = false }: { reactors: Reactor[]; small?: boolean; stacked?: boolean }) {
  const [open, setOpen] = useState(false);
  if (reactors.length === 0) return null;
  const tally = tallyReactions(reactors, "");
  const count = (
    <>
      {tally.top && <ReactionGlyph kind={tally.top} size={small ? "xs" : "md"} />}
      {tally.total}
    </>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${tally.total} ${tally.total === 1 ? "reaktion" : "reaktioner"}: ${reactorsLabel(reactors)}`}
        // The small chip on a chat bubble is drawn inside a finger-sized target that a
        // negative margin as big keeps from moving anything.
        className={`press-button flex shrink-0 items-center rounded-full text-slate-600 tabular-nums ${
          small ? "-m-1.5 p-1.5" : stacked ? "h-9 min-w-9 justify-center px-1.5" : "h-9 gap-1.5 px-2 text-sm"
        }`}
      >
        {small ? (
          <span className="flex h-5 items-center gap-1 rounded-full bg-white px-1.5 text-[11px] shadow-sm ring-1 ring-slate-200">{count}</span>
        ) : stacked ? (
          <span className="flex items-center">
            {tally.kinds.map(({ kind }, index) => (
              // Each a white disc a little over the one before it, the most given in front.
              <span
                key={kind}
                style={{ zIndex: tally.kinds.length - index }}
                className={`relative flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ring-white ${index > 0 ? "-ml-1.5" : ""}`}
              >
                <ReactionGlyph kind={kind} size="sm" />
              </span>
            ))}
          </span>
        ) : (
          count
        )}
      </button>
      <ReactorsDrawer open={open} onClose={() => setOpen(false)} reactors={reactors} />
    </>
  );
}

/**
 * A post's bar, as on Facebook: the reaction button — the crown until the viewer reacts,
 * then their own reaction, and beside it how many reacted; a press gives the crest's
 * crown, or takes the viewer's reaction back; held, every reaction comes up — whatever
 * else the bar holds (`children`, the comments), and at its end the kinds given (who, on a
 * press).
 */
export function PostReactions({ children, ...thing }: Thing & { children?: React.ReactNode }) {
  const { list, tally, choose, toggle } = useReactions(thing);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const button = useRef<HTMLButtonElement>(null);
  const { handlers, held } = useHold(() => setOpen(true));
  const meta = tally.mine && REACTIONS.find((r) => r.kind === tally.mine)!;

  return (
    <div>
      <div className="-mx-1 flex items-center gap-1">
        <button
          ref={button}
          type="button"
          {...handlers}
          onClick={() => {
            if (held()) return;
            if (tally.mine) choose(tally.mine, false);
            else choose(DEFAULT_REACTION, true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          aria-label={meta ? `Fjern din reaktion (${meta.label} ${meta.emoji})` : "Giv en krone 👑"}
          aria-pressed={tally.mine !== null}
          aria-haspopup="true"
          aria-expanded={open}
          title="Tryk for en krone – hold for flere"
          style={{ WebkitTouchCallout: "none" }}
          className={`press-button flex h-9 touch-manipulation items-center gap-1.5 rounded-xl px-2 text-sm font-medium select-none ${
            tally.mine ? "text-[var(--accent-text)]" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {tally.mine ? <ReactionGlyph kind={tally.mine} size="md" /> : <CrownOutline />}
          {/* How many reacted, in all; said in words by the kinds at the bar's end. */}
          {tally.total > 0 && <span aria-hidden className="tabular-nums">{tally.total}</span>}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Vælg en anden reaktion"
          className="press-text sr-only focus:not-sr-only focus:rounded-full focus:px-2 focus:text-xs focus:text-slate-600"
        >
          Flere
        </button>
        {children}
        {/* The kinds given, on the same row, at its end. */}
        <span className="ml-auto">
          <ReactionSummary reactors={list} stacked />
        </span>
      </div>
      {open && <ReactionMenu anchor={button} mine={tally.mine} onPick={(kind) => { close(); toggle(kind); }} onClose={close} />}
    </div>
  );
}

/**
 * A comment or a chat message that is held to do anything with it: holding it brings up
 * the reactions and `actions` (answer, copy, delete). Nothing shows on it until then but
 * the reactions it has, which `footer` places (it is handed the summary). For a keyboard
 * or a screen reader there is a button — seen only when it has the focus — that does the
 * same as holding.
 */
export function Holdable({
  label,
  actions,
  footer,
  children,
  className = "",
  ...thing
}: Thing & {
  /** Whose, in words: "Annas kommentar". */
  label: string;
  actions: HoldAction[];
  footer: (summary: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { list, tally, toggle } = useReactions(thing);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const anchor = useRef<HTMLDivElement>(null);
  const { handlers, held } = useHold(() => setOpen(true));

  return (
    <div className={className}>
      <div
        ref={anchor}
        {...handlers}
        onClickCapture={(event) => {
          // The click that ends a hold opens nothing inside (a picture, a link).
          if (held()) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        data-holdable=""
        style={{ WebkitTouchCallout: "none" }}
        // While its menu is open, what was held stands out a little, as on Facebook.
        className={`touch-manipulation transition-[filter] select-none ${open ? "brightness-90" : ""}`}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reager eller svar på ${label}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="press-text sr-only focus:not-sr-only focus:rounded-full focus:px-2 focus:text-xs focus:text-slate-600"
      >
        Handlinger
      </button>
      {footer(list.length > 0 ? <ReactionSummary reactors={list} small /> : null)}
      {open && (
        <ReactionMenu
          anchor={anchor}
          mine={tally.mine}
          onPick={(kind) => {
            close();
            toggle(kind);
          }}
          actions={actions}
          onClose={close}
        />
      )}
    </div>
  );
}

/** The crown before the viewer has reacted: an outline, to be pressed. */
function CrownOutline() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 6.5 7.5 12 12 3l4.5 9L21 6.5 19 20H5L3 6.5Z" />
    </svg>
  );
}
