"use client";

import { useRef, useState } from "react";
import { Photo, photoUrl } from "@/components/photo";

/** A post's pictures: one fills the card; several swipe sideways, with dots saying where you are. */
export function PhotoCarousel({ photoIds, alt }: { photoIds: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  if (photoIds.length === 1) {
    return (
      <a href={photoUrl(photoIds[0]!)} target="_blank" rel="noreferrer" className="block bg-slate-100">
        <Photo photoId={photoIds[0]!} alt={alt} className="max-h-[70vh] w-full object-contain" />
      </a>
    );
  }

  return (
    <div className="relative bg-slate-100">
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="scrollbar-hidden flex snap-x snap-mandatory overflow-x-auto"
      >
        {photoIds.map((id, i) => (
          <a key={id} href={photoUrl(id)} target="_blank" rel="noreferrer" className="w-full shrink-0 snap-center">
            <Photo photoId={id} alt={`${alt} (${i + 1} af ${photoIds.length})`} className="aspect-[4/5] w-full object-cover" />
          </a>
        ))}
      </div>
      <span className="absolute top-2 right-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-xs text-white">
        {index + 1}/{photoIds.length}
      </span>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {photoIds.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={`Vis billede ${i + 1}`}
            onClick={() => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" })}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
          />
        ))}
      </div>
    </div>
  );
}
