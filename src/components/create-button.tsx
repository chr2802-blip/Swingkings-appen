"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ActionMenu } from "@/components/action-menu";

/**
 * The tab's "+" button. On a phone it sits in the middle of the tab bar and, when the bar
 * slides away on the way down a page, slides to the bottom right corner instead and stays
 * (the CSS is `.app-create` in globals.css); from `md` up it is in that corner all along.
 * The nav keeps a gap for it only while a page has one.
 *
 * `CreateMenu` holds several ways to make something and opens a drawer of them;
 * `CreateAction` holds one dialog and opens it straight away.
 */

const FabLabel = createContext<boolean>(false);

/** Inside a `CreateAction`: the dialog's trigger is the "+" button itself. */
export function useCreateFab() {
  return useContext(FabLabel);
}

const noChange = () => () => {};

/**
 * Drawn into <body>: the page sits in an element that animates in, and a transformed
 * ancestor would make `fixed` mean "fixed to the page" instead of to the screen.
 */
export function CreateFab({ label, onClick }: { label: string; onClick: () => void }) {
  const browser = useSyncExternalStore(
    noChange,
    () => true,
    () => false,
  );
  if (!browser) return null;
  return createPortal(
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
      className="app-create fixed z-[45] flex h-15 w-15 items-center justify-center rounded-full bg-[var(--create)] text-[var(--create-text)] shadow-[0_10px_24px_-6px_rgb(15_25_40/0.6)] ring-4 ring-[var(--band)] hover:bg-[var(--create-hover)] md:ring-0"
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>,
    document.body,
  );
}

/** Several things to make: the "+" opens a drawer with a row for each dialog given. */
export function CreateMenu({ children }: { children: React.ReactNode }) {
  return (
    <ActionMenu label="Opret" trigger={(open) => <CreateFab label="Opret" onClick={open} />}>
      {children}
    </ActionMenu>
  );
}

/** One thing to make: the "+" is the dialog's own button, named after it. */
export function CreateAction({ children }: { children: React.ReactNode }) {
  return <FabLabel.Provider value={true}>{children}</FabLabel.Provider>;
}
