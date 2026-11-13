"use client";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, ModalBody } from "@/components/modal";
import { Button, type Variant } from "@/components/ui";
import { CreateFab, useCreateFab } from "@/components/create-button";

type MenuSlot = { slot: HTMLElement | null; close: () => void };

const MenuContext = createContext<MenuSlot | null>(null);

/**
 * A page's one action button. The actions it holds (dialogs, confirmations, a sync) stay
 * mounted here, outside the drawer, so the dialog a row opens outlives the drawer closing
 * behind it; only their buttons are drawn into the drawer, as rows, through `MenuTrigger`.
 * `icon` gives the small "⋯" button a list row uses for its own actions.
 */
export function ActionMenu({
  label = "Handlinger",
  title,
  icon = false,
  trigger,
  children,
}: {
  label?: string;
  /** The drawer's heading; the button's label when not given. */
  title?: string;
  icon?: boolean;
  /** Draws the button that opens the drawer, in place of the default ones. */
  trigger?: (open: () => void) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const close = () => setOpen(false);
  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : icon ? (
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="press-icon shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      ) : (
        <Button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {label}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      )}
      <Modal open={open} onClose={close} title={title ?? label} size="drawer">
        <ModalBody className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <ul ref={setSlot} className="-mx-2 flex flex-col" />
        </ModalBody>
      </Modal>
      <MenuContext.Provider value={{ slot: open ? slot : null, close }}>{children}</MenuContext.Provider>
    </>
  );
}

/** Inside an `ActionMenu`, the trigger's row in the drawer, or null; outside one, undefined. */
export function useMenuSlot() {
  return useContext(MenuContext);
}

const rowClass = (variant: Variant) =>
  `press-button flex w-full items-center rounded-xl px-3 py-3.5 text-left text-base font-medium hover:bg-slate-100 disabled:opacity-50 ${
    variant === "danger" ? "text-red-600" : "text-slate-800"
  }`;

/**
 * The button that opens a dialog: an ordinary button on the page, or a row in the drawer
 * when it sits inside an `ActionMenu` — the drawer then closes as the dialog opens.
 */
export function MenuTrigger({
  variant = "primary",
  className = "",
  onClick,
  children,
}: {
  variant?: Variant;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const menu = useMenuSlot();
  const fab = useCreateFab();
  if (!menu && fab) return <CreateFab label={textOf(children)} onClick={onClick} />;
  if (!menu) {
    return (
      <Button type="button" variant={variant} className={className} onClick={onClick}>
        {children}
      </Button>
    );
  }
  if (!menu.slot) return null;
  return createPortal(
    <li>
      <button
        type="button"
        className={rowClass(variant)}
        onClick={() => {
          menu.close();
          onClick();
        }}
      >
        {children}
      </button>
    </li>,
    menu.slot,
  );
}

/** A trigger's words, for the "+" button's name. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "Opret";
}

/**
 * A row that acts at once (sync, take a job, delete without asking): the drawer stays
 * open while the action runs and says how it went beneath the row. Null outside a menu —
 * a caller checks `useMenuSlot()` and draws its own button there.
 */
export function MenuForm({
  onSubmit,
  pending,
  message,
  variant = "secondary",
  label,
  children,
}: {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  message?: { ok: boolean; text: string } | null;
  variant?: Variant;
  label: React.ReactNode;
  children?: React.ReactNode;
}) {
  const menu = useMenuSlot();
  if (!menu?.slot) return null;
  return createPortal(
    <li>
      <form onSubmit={onSubmit}>
        {children}
        <button type="submit" disabled={pending} aria-busy={pending} className={rowClass(variant)}>
          {label}
        </button>
      </form>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`px-3 pb-2 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </li>,
    menu.slot,
  );
}
