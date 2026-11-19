"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NotificationCategory } from "@prisma/client";
import { Modal, ModalBody } from "@/components/modal";
import { Button } from "@/components/ui";
import { NotificationSetup } from "@/components/notification-setup";
import { followTeamSignal } from "@/components/team-signal";
import { useFormAction } from "@/components/use-form-action";
import { NOTIFIED } from "@/lib/realtime-topic";
import { ALWAYS_SENT, PUSH_CATEGORIES, bellLabel, opensOutside } from "@/lib/notification-categories";
import { stampLabel } from "@/lib/time";
import type { NotificationItem } from "@/lib/notifications";
import {
  markNotificationsSeen,
  readAllNotifications,
  readNotification,
  saveNotificationSettings,
} from "@/app/actions/notification-center";

/** Without the socket, the count is asked this often while the app is in view. */
const POLL_MS = 60_000;

type Center = { items: NotificationItem[]; unseen: number; muted: NotificationCategory[] };
type Tab = "list" | "settings";

const one = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

/**
 * The bell beside the chat: how many notifications came since the center was last
 * opened, and the center itself — what one has been told, "ny" until opened, and on the
 * second tab which of it buzzes the phone. The count follows the team's nudges (else a
 * slow poll), like the chat's.
 */
export function NotificationBell({ initialUnseen }: { initialUnseen: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [unseen, setUnseen] = useState(initialUnseen);
  const [live, setLive] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("list");
  const [center, setCenter] = useState<Center | null>(null);
  const [failed, setFailed] = useState(false);
  // Says the button answers presses yet, for a browser test to wait on.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    setUnseen(initialUnseen);
  }, [initialUnseen]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { unseen: number };
      setUnseen(body.unseen);
    } catch {
      // The next nudge or poll will try again.
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setCenter((await response.json()) as Center);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // A nudge while the center is open brings the new ones into it; while closed, the count.
  useEffect(() => {
    return followTeamSignal(NOTIFIED, () => void (open ? load() : refresh()), setLive);
  }, [open, load, refresh]);

  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, refresh]);

  async function show() {
    setTab("list");
    setOpen(true);
    setUnseen(0);
    await load();
    await markNotificationsSeen();
  }

  function close() {
    setOpen(false);
    void refresh();
  }

  function follow(item: NotificationItem) {
    setCenter((c) => c && { ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, read: true } : i)) });
    void readNotification(undefined, one({ id: item.id }));
    if (opensOutside(item.url)) {
      window.open(item.url, "_blank", "noopener");
      return;
    }
    const target = new URL(item.url, window.location.href);
    if (target.pathname === window.location.pathname) {
      // Already there: close, and go to the part of the page it is about.
      setOpen(false);
      if (target.hash) document.getElementById(target.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    // The sheet holds a history entry that closing it steps back over; it closes once the
    // new page is in (below), so that step cannot undo the navigation.
    router.push(item.url);
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function readAll() {
    setCenter((c) => c && { ...c, items: c.items.map((i) => ({ ...i, read: true })) });
    await readAllNotifications();
  }

  const unread = center?.items.filter((i) => !i.read).length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void show()}
        data-hydrated={hydrated || undefined}
        aria-label={unseen > 0 ? `Notifikationer, ${bellLabel(unseen)} nye` : "Notifikationer"}
        className="press-icon relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--band-soft)] hover:bg-[var(--band-hover)]"
      >
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unseen > 0 && (
          <span
            data-testid="bell-unseen"
            aria-hidden
            className="absolute -top-0.5 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-[var(--band)]"
          >
            {bellLabel(unseen)}
          </span>
        )}
      </button>

      <Modal open={open} onClose={close} title="Notifikationer">
        <div role="tablist" aria-label="Notifikationer" className="flex shrink-0 gap-1 border-b border-slate-100 px-5 pt-2">
          {(
            [
              ["list", "Notifikationer"],
              ["settings", "Indstillinger"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`press-text -mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === value ? "border-[var(--accent)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <ModalBody>
          {failed && !center && <p className="text-sm text-red-600">Notifikationerne kunne ikke hentes. Prøv igen.</p>}
          {!center && !failed && <p className="text-sm text-slate-500">Henter…</p>}
          {center && tab === "list" && <List items={center.items} unread={unread} onFollow={follow} onReadAll={readAll} />}
          {center && tab === "settings" && (
            <Settings muted={center.muted} onSaved={(muted) => setCenter((c) => c && { ...c, muted })} />
          )}
        </ModalBody>
      </Modal>
    </>
  );
}

function List({
  items,
  unread,
  onFollow,
  onReadAll,
}: {
  items: NotificationItem[];
  unread: number;
  onFollow: (item: NotificationItem) => void;
  onReadAll: () => void;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Du har ingen notifikationer endnu.</p>;
  }
  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onReadAll} className="-my-1">
            Marker alle som læst
          </Button>
        </div>
      )}
      <ul className="-mx-2 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onFollow(item)}
              aria-label={`${item.read ? "" : "Ny: "}${item.title}`}
              className={`press-card flex w-full gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 ${item.read ? "" : "bg-slate-50"}`}
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-red-600"}`}
              />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm break-words ${item.read ? "text-slate-700" : "font-semibold text-slate-900"}`}>
                  {item.title}
                </span>
                <span className="block text-sm break-words whitespace-pre-line text-slate-500">{item.body}</span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {stampLabel(new Date(item.at))}
                  {!item.read && <span className="ml-2 font-semibold text-red-600">Ny</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Settings({ muted, onSaved }: { muted: NotificationCategory[]; onSaved: (muted: NotificationCategory[]) => void }) {
  const { state, pending, handleSubmit } = useFormAction(saveNotificationSettings, {
    onSuccess: (form) => {
      const on = new FormData(form).getAll("on").map(String);
      onSaved(PUSH_CATEGORIES.map((c) => c.value).filter((value) => !on.includes(value)));
    },
  });
  return (
    <div className="space-y-5">
      <NotificationSetup />
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Vælg hvad der giver en notifikation på telefonen. Alt står stadig her under klokken.
        </p>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
          {PUSH_CATEGORIES.map((category) => (
            <li key={category.value}>
              <label className="press-card flex cursor-pointer items-start gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{category.label}</span>
                  <span className="block text-xs text-slate-500">{category.hint}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  name="on"
                  value={category.value}
                  defaultChecked={!muted.includes(category.value)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">{ALWAYS_SENT}</p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Gemmer…" : "Gem"}
          </Button>
          {state?.ok === true && state.note && <span className="text-sm text-slate-600">{state.note}</span>}
          {state?.ok === false && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}
