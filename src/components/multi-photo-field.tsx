"use client";

import { useRef, useState } from "react";
import { Button, Label } from "@/components/ui";
import { photoUrl } from "@/components/photo";
import { uploadPhoto } from "@/components/photo-field";
import { PhotoError } from "@/lib/downscale";
import { PHOTO_FIELD } from "@/lib/photo-file";

/**
 * Several pictures for one post. Each is shrunk on the phone (to 1280 px, a few hundred
 * KB at most) and uploaded the moment it is picked, one after the other, so the post
 * itself only carries ids — in the order they were chosen.
 */
export function MultiPhotoField({ max }: { max: number }) {
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function choose(files: FileList | null) {
    if (!files?.length) return;
    const room = max - photoIds.length;
    const picked = [...files].slice(0, room);
    setError(files.length > room ? `Højst ${max} billeder pr. opslag.` : null);
    setBusy({ done: 0, of: picked.length });
    for (const [index, file] of picked.entries()) {
      try {
        const id = await uploadPhoto(file);
        setPhotoIds((current) => [...current, id]);
      } catch (cause) {
        setError(cause instanceof PhotoError ? cause.message : "Et billede kunne ikke uploades. Prøv igen.");
      }
      setBusy({ done: index + 1, of: picked.length });
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <Label>Billeder</Label>
      {photoIds.map((id) => (
        <input key={id} type="hidden" name={PHOTO_FIELD} value={id} />
      ))}
      {photoIds.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photoIds.map((id, index) => (
            <li key={id} className="relative overflow-hidden rounded-xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- session-checked route */}
              <img src={photoUrl(id, "thumb")} alt={`Billede ${index + 1}`} className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotoIds((current) => current.filter((x) => x !== id))}
                aria-label={`Fjern billede ${index + 1}`}
                className="press-icon absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Vælg billeder"
        disabled={busy !== null}
        onChange={(event) => choose(event.target.files)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null || photoIds.length >= max}
          onClick={() => input.current?.click()}
        >
          {busy ? `Uploader ${busy.done + 1} af ${busy.of}…` : photoIds.length ? "Tilføj flere" : "Vælg billeder"}
        </Button>
        <span className="text-xs text-slate-500">
          {photoIds.length}/{max} · gøres mindre på telefonen før upload
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
