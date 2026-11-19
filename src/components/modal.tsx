"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { holdHistoryEntry } from "@/components/modal-history";
import { backdropOpacity, followPull, letsClose, pullIntent } from "@/lib/sheet-drag";

/** How long a sheet takes to leave; it is still on screen for this long after it closes. */
export const EXIT_MS = 200;

// Sheets can overlap — the action drawer is still closing as the dialog it opened comes
// up — so the page is locked while any is mounted, and unlocked by the last to go.
let locks = 0;

/** The open sheets, oldest first: Escape closes only the one on top (a picker over its dialog). */
const openSheets: object[] = [];
let unlocked = "";
export function lockScroll() {
  if (locks++ === 0) {
    unlocked = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--locks === 0) document.body.style.overflow = unlocked;
  };
}

/**
 * Full-screen sheet on a phone, centred panel from `sm` up, portalled into <body> so it
 * sits above the tab bar. `size="drawer"` rises only as far as its contents need — for
 * a confirmation or a small choice. Its body scrolls and its footer does not, so a
 * form's buttons stay on screen however long the form is.
 *
 * On a phone it is pulled down to close (`useSheetPull`): by its header, and a drawer
 * also by its body while that is scrolled to the top.
 */
export function Modal({
  open,
  onClose,
  title,
  size = "screen",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "screen" | "drawer";
  children: React.ReactNode;
}) {
  const drawer = size === "drawer";
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const sheetRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  useSheetPull({ open, mounted, drawer, sheetRef, gripRef, dimRef, onCloseRef });

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Browser back closes the sheet rather than leaving the page behind it.
  useEffect(() => {
    if (!open) return;
    return holdHistoryEntry(() => onCloseRef.current());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sheet = {};
    openSheets.push(sheet);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openSheets.at(-1) === sheet) onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openSheets.splice(openSheets.indexOf(sheet), 1);
    };
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    return lockScroll();
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4 ${drawer ? "items-end" : ""}`}>
      <div ref={dimRef} aria-hidden className="absolute inset-0">
        <div
          onClick={onClose}
          className={`absolute inset-0 bg-slate-900/50 backdrop-blur-[3px] ${closing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
        />
      </div>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl ${
          drawer ? "max-h-[85dvh] rounded-t-2xl" : "pt-[env(safe-area-inset-top)] sm:pt-0"
        } ${closing ? "animate-sheet-out" : "animate-sheet-in"}`}
      >
        <div ref={gripRef} className="shrink-0 touch-none border-b border-slate-100">
          {drawer && <div aria-hidden className="mx-auto mt-2 -mb-2 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />}
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="font-display min-w-0 flex-1 text-xl break-words">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Luk"
              className="press-icon -mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** How long a sheet let go of short of closing takes to slide back up. */
const SETTLE_MS = 200;

/**
 * Pulling the sheet down with a finger: it follows, the dimming lifts with it, and on
 * letting go it closes (sliding on from where the finger left it) or slides back up. The
 * rules are `src/lib/sheet-drag.ts`. Not on a centred panel (`sm` up), and never from a
 * field, nor from a drawer's body once it has been scrolled down.
 */
function useSheetPull({
  open,
  mounted,
  drawer,
  sheetRef,
  gripRef,
  dimRef,
  onCloseRef,
}: {
  open: boolean;
  mounted: boolean;
  drawer: boolean;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  gripRef: React.RefObject<HTMLDivElement | null>;
  dimRef: React.RefObject<HTMLDivElement | null>;
  onCloseRef: React.RefObject<() => void>;
}) {
  useEffect(() => {
    const sheet = sheetRef.current;
    const dim = dimRef.current;
    if (!open || !sheet || !dim) return;
    // Opened again while still leaving: start from where it belongs.
    sheet.style.transform = dim.style.opacity = sheet.style.transition = dim.style.transition = "";

    type Pull = {
      x: number;
      y: number;
      dy: number;
      lastY: number;
      lastAt: number;
      speed: number;
    };
    let pull: (Pull & { state: "undecided" | "pull" }) | null = null;

    const mayStart = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !sheet.contains(target)) return false;
      if (window.matchMedia("(min-width: 640px)").matches) return false;
      if (target.closest("input, textarea, select, [contenteditable]")) return false;
      if (gripRef.current?.contains(target)) return true;
      if (!drawer) return false;
      // A drawer's body only while nothing between the finger and the sheet is scrolled.
      for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
      }
      return true;
    };

    const place = (dy: number) => {
      sheet.style.transform = dy ? `translateY(${dy}px)` : "";
      dim.style.opacity = String(backdropOpacity(dy, sheet.offsetHeight));
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch || !mayStart(event.target)) {
        pull = null;
        return;
      }
      sheet.style.transition = dim.style.transition = "none";
      pull = {
        state: "undecided",
        x: touch.clientX,
        y: touch.clientY,
        dy: 0,
        lastY: touch.clientY,
        lastAt: event.timeStamp,
        speed: 0,
      };
    };

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!pull || !touch) return;
      if (pull.state === "undecided") {
        const intent = pullIntent(touch.clientX - pull.x, touch.clientY - pull.y);
        if (intent === "undecided") return;
        if (intent === "other") {
          pull = null;
          return;
        }
        pull.state = "pull";
      }
      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - pull.lastAt);
      pull.speed = 0.8 * ((touch.clientY - pull.lastY) / elapsed) + 0.2 * pull.speed;
      pull.lastY = touch.clientY;
      pull.lastAt = event.timeStamp;
      pull.dy = followPull(touch.clientY - pull.y);
      place(pull.dy);
    };

    const onEnd = (event: TouchEvent) => {
      const done = pull;
      pull = null;
      if (!done || done.state !== "pull") return;
      if (event.type === "touchend" && letsClose(done.dy, sheet.offsetHeight, done.speed)) {
        // Left where the finger let go; the leaving animation carries it on down.
        onCloseRef.current();
        return;
      }
      const ease = `${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      sheet.style.transition = `transform ${ease}`;
      dim.style.transition = `opacity ${ease}`;
      place(0);
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: once it is a pull, the page behind must not scroll.
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [open, mounted, drawer, sheetRef, gripRef, dimRef, onCloseRef]);
}

export function ModalBody({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 ${className}`}>{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-slate-100 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
