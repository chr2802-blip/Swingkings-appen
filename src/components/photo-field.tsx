"use client";

import { useId, useRef, useState } from "react";
import { Button, Label } from "@/components/ui";
import { Avatar, photoUrl } from "@/components/photo";
import { ActionMenu, MenuTrigger } from "@/components/action-menu";
import { PhotoError, preparePhoto } from "@/lib/downscale";
import { PHOTO_FIELD } from "@/lib/photo-file";

/**
 * Upload a picture the moment it is chosen and let the form carry only the id. The
 * picture is shrunk in the browser first, so a phone photo never travels whole.
 */
export async function uploadPhoto(file: File): Promise<string> {
  const prepared = await preparePhoto(file);
  const upload = new FormData();
  upload.set("photo", prepared.full, "photo.jpg");
  upload.set("thumb", prepared.thumb, "thumb.jpg");
  const response = await fetch("/api/photos", { method: "POST", body: upload });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new PhotoError(body.error ?? "Billedet kunne ikke gemmes.");
  return String(body.id);
}

/** A picture chosen and uploaded at once: the id the form carries, and the input to choose with. */
function useChosenPhoto(defaultPhotoId: string | null) {
  const [photoId, setPhotoId] = useState<string | null>(defaultPhotoId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPhotoId(await uploadPhoto(file));
    } catch (cause) {
      setError(cause instanceof PhotoError ? cause.message : "Billedet kunne ikke uploades. Prøv igen.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return { photoId, setPhotoId, busy, error, input, choose, pick: () => input.current?.click() };
}

/**
 * One's own picture, round as it is everywhere else it is shown. Pressing it with a picture
 * opens a drawer to change or remove it; with none there is nothing to remove, so it goes
 * straight to choosing one.
 */
export function ProfilePhotoField({ name, defaultPhotoId = null }: { name: string; defaultPhotoId?: string | null }) {
  const { photoId, setPhotoId, busy, error, input, choose, pick } = useChosenPhoto(defaultPhotoId);
  const inputId = useId();
  const label = busy ? "Uploader…" : photoId ? "Skift eller fjern profilbillede" : "Vælg profilbillede";

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Profilbillede</Label>
      <input type="hidden" name={PHOTO_FIELD} value={photoId ?? ""} />
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <ActionMenu
        title="Profilbillede"
        trigger={({ toggle }) => (
          <button
            type="button"
            aria-label={label}
            aria-haspopup={photoId ? "dialog" : undefined}
            disabled={busy}
            onClick={photoId ? toggle : pick}
            className="press-button relative block rounded-full disabled:opacity-60"
          >
            <Avatar name={name} photoId={photoId} size="xl" />
            <span
              aria-hidden
              className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow ring-1 ring-slate-200"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
          </button>
        )}
      >
        <MenuTrigger variant="secondary" onClick={pick}>
          Skift billede
        </MenuTrigger>
        <MenuTrigger variant="danger" onClick={() => setPhotoId(null)}>
          Fjern billede
        </MenuTrigger>
      </ActionMenu>
      {busy && <p className="text-xs text-slate-500">Uploader…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function PhotoField({
  defaultPhotoId = null,
  label = "Billede",
  aspect = "aspect-[4/3]",
}: {
  defaultPhotoId?: string | null;
  label?: string;
  aspect?: string;
}) {
  const { photoId, setPhotoId, busy, error, input, choose } = useChosenPhoto(defaultPhotoId);
  const inputId = useId();

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <input type="hidden" name={PHOTO_FIELD} value={photoId ?? ""} />
      {photoId && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- session-checked route */}
          <img src={photoUrl(photoId, "thumb")} alt="Valgt billede" className={`${aspect} w-full object-cover`} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploader…" : photoId ? "Skift billede" : "Vælg billede"}
        </Button>
        {photoId && !busy && (
          <Button type="button" variant="ghost" onClick={() => setPhotoId(null)}>
            Fjern
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
