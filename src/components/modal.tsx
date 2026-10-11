"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 200;

/**
 * Full-screen sheet on a phone, centred panel from `sm` up, portalled into <body> so it
 * sits above the tab bar. `size="drawer"` rises only as far as its contents need — for
 * a confirmation or a small choice. Its body scrolls and its footer does not, so a
 * form's buttons stay on screen however long the form is.
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

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4 ${drawer ? "items-end" : ""}`}>
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/50 backdrop-blur-[3px] ${closing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl ${
          drawer ? "max-h-[85dvh] rounded-t-2xl" : "pt-[env(safe-area-inset-top)] sm:pt-0"
        } ${closing ? "animate-sheet-out" : "animate-sheet-in"}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
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
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalBody({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 ${className}`}>{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-slate-100 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
  );
}
