"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sendChatMessage, deleteChatMessage } from "@/app/actions/social";
import { Avatar, Photo, photoUrl } from "@/components/photo";
import { uploadPhoto } from "@/components/photo-field";
import { PhotoError } from "@/lib/downscale";
import { CHAT_POSTED } from "@/lib/realtime-topic";
import { followTeamSignal } from "@/components/team-signal";
import { stampLabel } from "@/lib/time";
import type { ChatItem } from "@/lib/chat";

/** Poll fast while the socket is not live, slowly while it is (the poll is then only a safety net). */
const POLL_MS = 5_000;
const LIVE_POLL_MS = 45_000;

export function ChatRoom({ initial, viewerId, canModerate }: { initial: ChatItem[]; viewerId: string; canModerate: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [live, setLive] = useState(false);
  const [text, setText] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastId = useRef(initial.at(-1)?.id);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { messages: ChatItem[] };
      setMessages(body.messages);
    } catch {
      // The next poll will try again.
    }
  }, []);

  useEffect(() => followTeamSignal(CHAT_POSTED, refresh, setLive), [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, live ? LIVE_POLL_MS : POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, refresh]);

  // Scroll to the newest message when one arrives, not on every redraw.
  useEffect(() => {
    const newest = messages.at(-1)?.id;
    if (newest !== lastId.current) {
      lastId.current = newest;
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), []);

  async function attach(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setPhotoId(await uploadPhoto(file));
    } catch (cause) {
      setError(cause instanceof PhotoError ? cause.message : "Billedet kunne ikke uploades.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (!text.trim() && !photoId) return;
    const data = new FormData();
    data.set("body", text);
    data.set("photoId", photoId ?? "");
    startTransition(async () => {
      const result = await sendChatMessage(undefined, data);
      if (result?.ok) {
        setText("");
        setPhotoId(null);
        setError(null);
        await refresh();
      } else if (result) {
        setError(result.error);
      }
    });
  }

  function remove(id: string) {
    const data = new FormData();
    data.set("id", id);
    startTransition(async () => {
      await deleteChatMessage(undefined, data);
      await refresh();
    });
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <ol className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <li className="py-16 text-center text-sm text-slate-500">Ingen beskeder endnu. Sig hej til holdet 👋</li>
        )}
        {messages.map((message, index) => {
          const own = message.author.id === viewerId;
          const previous = messages[index - 1];
          const grouped = previous?.author.id === message.author.id;
          return (
            <li key={message.id} className={`group flex items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
              <span className={`w-8 ${grouped ? "invisible" : ""}`}>
                {!own && <Avatar name={message.author.name} photoId={message.author.photoId} size="sm" />}
              </span>
              <div className={`flex max-w-[78%] flex-col ${own ? "items-end" : "items-start"}`}>
                {!grouped && !own && <span className="mb-0.5 px-1 text-xs text-slate-500">{message.author.name}</span>}
                <div
                  className={`overflow-hidden rounded-2xl ${
                    own ? "bg-[var(--accent)] text-white" : "border border-slate-200 bg-white"
                  }`}
                >
                  {message.photoId && (
                    <a href={photoUrl(message.photoId)} target="_blank" rel="noreferrer">
                      <Photo photoId={message.photoId} alt="Billede i chatten" size="thumb" className="max-h-72 w-full object-cover" />
                    </a>
                  )}
                  {message.body && <p className="px-3.5 py-2 text-sm whitespace-pre-line">{message.body}</p>}
                </div>
                <span className="mt-0.5 flex gap-2 px-1 text-[11px] text-slate-400">
                  {stampLabel(new Date(message.createdAt))}
                  {(own || canModerate) && (
                    <button type="button" onClick={() => remove(message.id)} className="hidden hover:text-red-600 group-hover:inline">
                      Slet
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
        <div ref={bottom} />
      </ol>

      <form
        onSubmit={send}
        className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] -mx-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg md:bottom-4"
      >
        {photoId && (
          <div className="mb-2 flex items-center gap-2">
            <Photo photoId={photoId} alt="Valgt billede" size="thumb" className="h-14 w-14 rounded-lg object-cover" />
            <button type="button" onClick={() => setPhotoId(null)} className="text-xs text-slate-500 underline">
              Fjern billede
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mb-2 px-1 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={(e) => attach(e.target.files?.[0])} />
          <button
            type="button"
            aria-label="Vedhæft billede"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="press-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="15" rx="3" />
                <circle cx="12" cy="12.5" r="3.5" />
                <path d="M8 5l1.5-2h5L16 5" />
              </svg>
            )}
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Skriv til holdet…"
            aria-label="Besked"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={pending || uploading || (!text.trim() && !photoId)}
            aria-label="Send"
            className="press-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
