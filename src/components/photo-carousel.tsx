"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Photo } from "@/components/photo";
import { PhotoViewer } from "@/components/photo-viewer";
import { MAX_SCALE, distance, midpoint, type Point } from "@/lib/zoom";

/**
 * A post's pictures: one fills the card; several swipe sideways, with dots saying where
 * you are. Pinch one with two fingers and it grows right where it is, over the page, and
 * springs back when let go; press it to open the full-screen viewer.
 */
export function PhotoCarousel({ photoIds, alt }: { photoIds: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const { overlay, justPinched } = useInPlacePinch(area);

  function open(at: number) {
    // The lift of a pinch is not a press.
    if (justPinched()) return;
    setViewing(at);
  }

  const viewer = viewing !== null && (
    <PhotoViewer photoIds={photoIds} index={viewing} alt={alt} onClose={() => setViewing(null)} />
  );

  if (photoIds.length === 1) {
    return (
      <div ref={area} className="touch-pan-x touch-pan-y bg-slate-100">
        <button type="button" onClick={() => open(0)} className="block w-full cursor-zoom-in">
          <Photo photoId={photoIds[0]!} alt={alt} className="max-h-[70vh] w-full object-contain" />
        </button>
        {overlay}
        {viewer}
      </div>
    );
  }

  return (
    <div ref={area} className="relative touch-pan-x touch-pan-y bg-slate-100">
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="scrollbar-hidden flex snap-x snap-mandatory overflow-x-auto"
      >
        {photoIds.map((id, i) => (
          <button key={id} type="button" onClick={() => open(i)} className="w-full shrink-0 cursor-zoom-in snap-center">
            <Photo photoId={id} alt={`${alt} (${i + 1} af ${photoIds.length})`} className="aspect-[4/5] w-full object-cover" />
          </button>
        ))}
      </div>
      <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-xs text-white">
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
      {overlay}
      {viewer}
    </div>
  );
}

type Pinched = {
  src: string;
  fit: string;
  box: { left: number; top: number; width: number; height: number };
  origin: Point;
  scale: number;
  shift: Point;
  letGo: boolean;
};

const SPRING_MS = 220;

/**
 * Pinching a picture in the feed. The picture is copied into a layer over the whole page
 * at the same spot — the card and the sideways strip would otherwise clip it — and the
 * copy follows the fingers; let go and it glides back and the layer goes away.
 */
function useInPlacePinch(area: React.RefObject<HTMLDivElement | null>) {
  const [pinched, setPinched] = useState<Pinched | null>(null);
  const endedAt = useRef(0);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let active: { img: HTMLImageElement; startMid: Point; startDistance: number } | null = null;
    let springTimer: ReturnType<typeof setTimeout> | null = null;
    const point = (touch: Touch): Point => ({ x: touch.clientX, y: touch.clientY });

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2 || active) return;
      const [a, b] = [point(event.touches[0]!), point(event.touches[1]!)];
      const target = event.target instanceof Element ? event.target.closest("button")?.querySelector("img") : null;
      const img = target ?? el!.querySelector("img");
      if (!img) return;
      event.preventDefault();
      if (springTimer) clearTimeout(springTimer);
      const rect = img.getBoundingClientRect();
      const startMid = midpoint(a, b);
      active = { img, startMid, startDistance: distance(a, b) };
      img.style.visibility = "hidden";
      setPinched({
        src: img.currentSrc || img.src,
        fit: getComputedStyle(img).objectFit,
        box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        origin: { x: startMid.x - rect.left, y: startMid.y - rect.top },
        scale: 1,
        shift: { x: 0, y: 0 },
        letGo: false,
      });
    }

    function onTouchMove(event: TouchEvent) {
      if (!active) return;
      event.preventDefault();
      if (event.touches.length < 2) return;
      const [a, b] = [point(event.touches[0]!), point(event.touches[1]!)];
      const scale = Math.min(MAX_SCALE, Math.max(1, distance(a, b) / active.startDistance));
      const mid = midpoint(a, b);
      const shift = { x: mid.x - active.startMid.x, y: mid.y - active.startMid.y };
      setPinched((current) => current && { ...current, scale, shift });
    }

    function onTouchEnd(event: TouchEvent) {
      if (!active || event.touches.length >= 2) return;
      const { img } = active;
      active = null;
      endedAt.current = Date.now();
      setPinched((current) => current && { ...current, scale: 1, shift: { x: 0, y: 0 }, letGo: true });
      springTimer = setTimeout(() => {
        img.style.visibility = "";
        setPinched(null);
      }, SPRING_MS);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (springTimer) clearTimeout(springTimer);
      if (active) active.img.style.visibility = "";
    };
  }, [area]);

  const overlay =
    pinched && typeof document !== "undefined"
      ? createPortal(
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
            <div
              className="absolute inset-0 bg-black"
              style={{
                opacity: Math.min(0.7, (pinched.scale - 1) * 0.7),
                transition: pinched.letGo ? `opacity ${SPRING_MS}ms ease` : "none",
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- the same session-checked picture, already loaded */}
            <img
              src={pinched.src}
              alt=""
              className="absolute"
              style={{
                ...pinched.box,
                objectFit: pinched.fit as React.CSSProperties["objectFit"],
                transformOrigin: `${pinched.origin.x}px ${pinched.origin.y}px`,
                transform: `translate3d(${pinched.shift.x}px, ${pinched.shift.y}px, 0) scale(${pinched.scale})`,
                transition: pinched.letGo ? `transform ${SPRING_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : "none",
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return { overlay, justPinched: () => Date.now() - endedAt.current < 400 };
}

