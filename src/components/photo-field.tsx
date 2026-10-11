"use client";

import { useId, useRef, useState } from "react";
import { Button, Label } from "@/components/ui";
import { photoUrl } from "@/components/photo";
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

export function PhotoField({
  defaultPhotoId = null,
  label = "Billede",
  aspect = "aspect-[4/3]",
}: {
  defaultPhotoId?: string | null;
  label?: string;
  aspect?: string;
}) {
  const [photoId, setPhotoId] = useState<string | null>(defaultPhotoId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

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
