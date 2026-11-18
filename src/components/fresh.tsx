"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sheetsSettled } from "@/components/modal-history";
import type { ActionResult } from "@/lib/action-result";

/**
 * Showing what a press just made: the fines given, the challenge reported, the fines an
 * approval moved. The page goes to where it is listed — a tab of the page it was made on
 * (the activity's or the player's own fines) slides in, else the fine box's history slides
 * in or is opened — and each new row pulses there.
 *
 * A row says what it is with `data-fresh` (space-separated ids: a fine's own, and the
 * challenge it came from), so a challenge's id finds the two fines its approval made.
 */

/** Asks a `SwipePages` on screen to turn to `detail.href`; it cancels the event if it can. */
export const TURN_EVENT = "swingkings:turn";
/**
 * Asks the open `DetailSheet`s: the one whose `clearParam` is `detail.param` opens (and
 * cancels the event), every other one closes — the page is about to show something else.
 */
export const SHEET_EVENT = "swingkings:sheet";
/** New ids are waiting to pulse: `FreshPulse` looks again. */
const PENDING_EVENT = "swingkings:fresh";

/** Where the fine box's history is, and its challenges' sheet. */
export const FINE_HISTORY_HREF = "/boder/historik";
export const CHALLENGES_HREF = "/boder?udfordringer";
const CHALLENGES_PARAM = "udfordringer";

/** Ids that have been made and not yet seen pulse. Module state: it survives a client navigation. */
const pending = new Set<string>();
/** How long a fresh id waits for its row before it is forgotten. */
const WAIT_MS = 8000;

/** Whether somebody on the page took the request (cancelled the event). */
function handledHere(name: string, detail: Record<string, unknown>) {
  return !window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true }));
}

/**
 * `show(result, where)`: after an action that worked, takes the page to `where` — the
 * address of a swipe page that lists what was made (the fine box's history by default, an
 * activity's or a player's fines tab), or `CHALLENGES_HREF` for the challenges' sheet —
 * with what it made pulsing there. A swipe page already on screen slides there; anything
 * else is opened.
 */
export function useShowFresh() {
  const router = useRouter();
  return useCallback(
    async (result: ActionResult, where: string = FINE_HISTORY_HREF) => {
      const ids = result?.ok ? (result.created ?? []) : [];
      if (ids.length === 0) return;
      // A challenge's id names its card among the waiting ones, and in the history its
      // two fines: the card is asked for as `card:<id>`, so a card still in a closing sheet
      // is not taken for the fines.
      const challenges = where === CHALLENGES_HREF;
      const tokens = challenges ? ids.map((id) => `card:${id}`) : ids;
      for (const token of tokens) pending.add(token);
      setTimeout(() => tokens.forEach((token) => pending.delete(token)), WAIT_MS);
      const announce = () => window.dispatchEvent(new Event(PENDING_EVENT));

      if (challenges && handledHere(SHEET_EVENT, { param: CHALLENGES_PARAM })) return announce();
      // Every other sheet gets out of the way, and must have let go of its history entry
      // before the page moves, or its `history.back()` lands after the move and undoes it.
      if (!challenges) handledHere(SHEET_EVENT, { param: null });
      await sheetsSettled();
      if (challenges) router.push(CHALLENGES_HREF);
      else if (!handledHere(TURN_EVENT, { href: where })) router.push(where);
      announce();
    },
    [router],
  );
}

/** The rows a fresh id names. */
function rowsFor(id: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-fresh~="${CSS.escape(id)}"]`)];
}

/**
 * Mounted where fresh rows are listed (the fine box, an activity, a player). Watches for the rows of pending ids
 * to arrive, and pulses each once it is actually in view — a row on a page still sliding
 * in, or in a sheet still opening, pulses when it gets there rather than unseen.
 */
export function FreshPulse() {
  useEffect(() => {
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const row = entry.target as HTMLElement;
        // A page not slid to yet is collapsed and invisible: wait until it is shown.
        if (!entry.isIntersecting || entry.intersectionRect.height === 0) continue;
        if (row.checkVisibility && !row.checkVisibility({ visibilityProperty: true })) continue;
        seen.unobserve(row);
        row.classList.remove("fresh-pulse");
        void row.offsetWidth; // restart the animation, should the same row pulse twice
        row.classList.add("fresh-pulse");
        row.addEventListener("animationend", () => row.classList.remove("fresh-pulse"), { once: true });
      }
    });
    const look = () => {
      for (const id of [...pending]) {
        const rows = rowsFor(id);
        if (rows.length === 0) continue;
        pending.delete(id);
        rows.forEach((row) => seen.observe(row));
      }
    };
    // The rows come with the server's answer, which may land just before or after the press resolves.
    const watch = new MutationObserver(() => pending.size > 0 && look());
    watch.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(PENDING_EVENT, look);
    look();
    return () => {
      watch.disconnect();
      seen.disconnect();
      window.removeEventListener(PENDING_EVENT, look);
    };
  }, []);
  return null;
}
