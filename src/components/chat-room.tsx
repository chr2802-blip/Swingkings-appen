"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { sendChatMessage, deleteChatMessage } from "@/app/actions/social";
import { Avatar, Photo } from "@/components/photo";
import { PhotoViewer } from "@/components/photo-viewer";
import { PlayerLink } from "@/components/player-link";
import { uploadPhoto } from "@/components/photo-field";
import { PhotoError } from "@/lib/downscale";
import { MAX_CHAT_PHOTOS, PHOTO_FIELD } from "@/lib/photo-file";
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
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
  const [viewing, setViewing] = useState<{ photoIds: string[]; index: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastId = useRef(initial.at(-1)?.id);
  const box = useRef<HTMLTextAreaElement>(null);

  // The box is as tall as its text (up to max-h-32, then it scrolls), and shrinks back when sent.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

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

  useEffect(() => {
    return followTeamSignal(CHAT_POSTED, refresh, setLive);
  }, [refresh]);

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
  // A body, not an arrow's value: newer browsers return a Promise from scrollIntoView, and
  // React would call it as the effect's clean-up when the chat is left.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, []);

  /** Each picture is shrunk and uploaded the moment it is picked, one after the other, in the order chosen. */
  async function attach(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_CHAT_PHOTOS - photoIds.length;
    const picked = [...files].slice(0, room);
    setError(files.length > room ? `Højst ${MAX_CHAT_PHOTOS} billeder pr. besked.` : null);
    setUploading({ done: 0, of: picked.length });
    for (const [index, file] of picked.entries()) {
      try {
        const id = await uploadPhoto(file);
        setPhotoIds((current) => [...current, id]);
      } catch (cause) {
        setError(cause instanceof PhotoError ? cause.message : "Et billede kunne ikke uploades.");
      }
      setUploading({ done: index + 1, of: picked.length });
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (uploading || (!text.trim() && photoIds.length === 0)) return;
    const data = new FormData();
    data.set("body", text);
    for (const id of photoIds) data.append(PHOTO_FIELD, id);
    startTransition(async () => {
      const result = await sendChatMessage(undefined, data);
      if (result?.ok) {
        setText("");
        setPhotoIds([]);
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
                {!own && (
                  <PlayerLink userId={message.author.id} aria-label={message.author.name} tabIndex={grouped ? -1 : undefined}>
                    <Avatar name={message.author.name} photoId={message.author.photoId} size="sm" />
                  </PlayerLink>
                )}
              </span>
              <div className={`flex max-w-[78%] flex-col ${own ? "items-end" : "items-start"}`}>
                {!grouped && !own && (
                  <PlayerLink userId={message.author.id} className="mb-0.5 px-1 text-xs text-slate-500">
                    {message.author.name}
                  </PlayerLink>
                )}
                <div
                  className={`overflow-hidden rounded-2xl ${
                    own ? "bg-[var(--accent)] text-white" : "border border-slate-200 bg-white"
                  }`}
                >
                  {message.photoIds.length > 0 && (
                    <ChatPhotos photoIds={message.photoIds} onOpen={(index) => setViewing({ photoIds: message.photoIds, index })} />
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
        className="app-composer sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] -mx-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg md:bottom-4"
      >
        {(photoIds.length > 0 || uploading) && (
          <ul className="scrollbar-hidden mb-2 flex gap-2 overflow-x-auto pt-1" aria-label="Valgte billeder">
            {photoIds.map((id, index) => (
              <li key={id} className="relative shrink-0">
                <Photo photoId={id} alt={`Valgt billede ${index + 1}`} size="thumb" className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoIds((current) => current.filter((x) => x !== id))}
                  aria-label={`Fjern billede ${index + 1}`}
                  className="press-icon absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-white"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
            {uploading && (
              <li className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-slate-100 text-[10px] text-slate-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                {uploading.done + 1}/{uploading.of}
              </li>
            )}
          </ul>
        )}
        {error && (
          <p role="alert" className="mb-2 px-1 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-label="Vælg billeder"
            tabIndex={-1}
            onChange={(e) => attach(e.target.files)}
          />
          <button
            type="button"
            aria-label="Vedhæft billeder"
            disabled={uploading !== null || photoIds.length >= MAX_CHAT_PHOTOS}
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
            ref={box}
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
            disabled={pending || uploading !== null || (!text.trim() && photoIds.length === 0)}
            aria-label="Send"
            className="press-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
      {viewing && (
        <PhotoViewer photoIds={viewing.photoIds} index={viewing.index} alt="Billede i chatten" onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/**
 * A message's pictures inside its bubble: one on its own, two side by side, more as a
 * grid of four with "+n" on the last. Pressing one opens them all in the viewer, there.
 */
function ChatPhotos({ photoIds, onOpen }: { photoIds: string[]; onOpen: (index: number) => void }) {
  const count = photoIds.length;
  if (count === 1) {
    return (
      <button type="button" onClick={() => onOpen(0)} className="block w-full cursor-zoom-in">
        <Photo photoId={photoIds[0]!} alt="Billede i chatten" size="thumb" className="max-h-72 w-full object-cover" />
      </button>
    );
  }
  const shown = photoIds.slice(0, 4);
  return (
    <div className="grid w-60 max-w-full grid-cols-2 gap-0.5 bg-white">
      {shown.map((id, index) => {
        const more = index === shown.length - 1 ? count - shown.length : 0;
        const wide = count === 3 && index === 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(index)}
            className={`relative cursor-zoom-in ${wide ? "col-span-2" : ""}`}
          >
            <Photo
              photoId={id}
              alt={`Billede i chatten (${index + 1} af ${count})`}
              size="thumb"
              className={`w-full object-cover ${wide ? "aspect-[2/1]" : count === 2 ? "aspect-[3/4]" : "aspect-square"}`}
            />
            {more > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50 text-xl font-semibold text-white">
                +{more}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
