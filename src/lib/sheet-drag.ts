/**
 * Pulling a sheet down to close it, on a phone. The rules are here; `Modal`
 * (`src/components/modal.tsx`) moves the sheet with the finger.
 *
 * Where a pull may start is the sheet's to say: its header always (and the grip above a
 * drawer's), and a drawer's body only while it is scrolled to the top, so a finger
 * scrolling a long form never closes it by surprise. A full-screen sheet is pulled by its
 * header only — what has been typed in it is lost when it closes.
 */

/** How far a finger moves before it is read as pulling down or as something else. */
export const INTENT_PX = 8;
/** The share of the sheet's height past which letting go closes it. */
export const CLOSE_SHARE = 1 / 3;
/** However tall the sheet, pulled this far it closes. */
export const CLOSE_PX = 160;
/** Faster than this downwards (px per ms) closes it, however short the pull. */
export const FLICK_SPEED = 0.5;
/** A flick must still have moved this far, so a twitch is not a flick. */
const FLICK_MIN_PX = 40;

/**
 * What a finger that has moved (dx, dy) from where it started is doing: not yet known,
 * pulling the sheet down, or something else (scrolling up, or sideways).
 */
export function pullIntent(dx: number, dy: number): "undecided" | "pull" | "other" {
  if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return "undecided";
  return dy > 0 && dy > Math.abs(dx) ? "pull" : "other";
}

/** How far the sheet follows the finger: down freely, up only a little, and back again. */
export function followPull(dy: number) {
  return dy >= 0 ? dy : -Math.min(12, Math.sqrt(-dy));
}

/** Whether letting go after `dy` pixels, moving down at `speed` px/ms, closes a sheet `height` tall. */
export function letsClose(dy: number, height: number, speed: number) {
  if (dy >= Math.min(CLOSE_PX, height * CLOSE_SHARE)) return true;
  return dy >= FLICK_MIN_PX && speed >= FLICK_SPEED;
}

/** How much of the dimmed backdrop stays as the sheet is pulled `dy` of its `height` down. */
export function backdropOpacity(dy: number, height: number) {
  if (dy <= 0 || height <= 0) return 1;
  return Math.max(0, 1 - dy / height);
}
