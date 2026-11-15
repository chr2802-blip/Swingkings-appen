"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAT_POSTED } from "@/lib/realtime-topic";
import { followTeamSignal } from "@/components/team-signal";
import { unreadLabel } from "@/lib/chat-count";

/** Without the socket, the count is asked this often while the app is in view. */
const POLL_MS = 60_000;

/**
 * The chat's way in, in the header, with how many messages one has not read. The count
 * follows the team's chat nudges (else a slow poll) and is asked again when the chat is
 * left; on the chat itself there is nothing unread.
 */
export function ChatButton({ initialUnread }: { initialUnread: number }) {
  const pathname = usePathname();
  const inChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const [unread, setUnread] = useState(initialUnread);
  const [live, setLive] = useState(false);
  const wasInChat = useRef(inChat);
  // Says the header has come alive (and with it the scroll listener beside it), for the
  // pages without a tab of their own to wait on, as the tab bar's highlight is on the rest.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // A server render (an action's revalidation) brings a fresh count.
  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/unread", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { unread: number };
      setUnread(body.unread);
    } catch {
      // The next nudge or poll will try again.
    }
  }, []);

  useEffect(() => {
    // In the chat everything is read; once it is left, what came in since is asked for.
    if (inChat) setUnread(0);
    else if (wasInChat.current) void refresh();
    wasInChat.current = inChat;
  }, [inChat, refresh]);

  useEffect(() => {
    if (inChat) return;
    return followTeamSignal(CHAT_POSTED, () => void refresh(), setLive);
  }, [inChat, refresh]);

  useEffect(() => {
    if (inChat || live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [inChat, live, refresh]);

  const shown = inChat ? 0 : unread;
  return (
    <Link
      href="/chat"
      aria-current={inChat ? "page" : undefined}
      data-hydrated={hydrated || undefined}
      aria-label={shown > 0 ? `Chat, ${unreadLabel(shown)} ulæste` : "Chat"}
      className={`press-icon relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        inChat ? "bg-[var(--band-active)] text-[var(--band-active-text)]" : "text-[var(--band-soft)] hover:bg-[var(--band-hover)]"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z" />
      </svg>
      {shown > 0 && (
        <span
          data-testid="chat-unread"
          aria-hidden
          className="absolute -top-0.5 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-[var(--band)]"
        >
          {unreadLabel(shown)}
        </span>
      )}
    </Link>
  );
}
