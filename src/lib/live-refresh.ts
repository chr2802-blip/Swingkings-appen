/**
 * When a page that shows the feed or the fine box reads itself again after a teammate
 * changed something (`LiveRefresh`, `src/components/live-refresh.tsx`). Kept apart from
 * React so the rules can be tested on their own:
 *
 * - Nudges that arrive close together (a post and its notification, five likes in a row)
 *   become one read, `LIVE_REFRESH_DELAY_MS` after the first.
 * - A phone with the app in the background reads nothing; it reads once when it is
 *   looked at again, and only if something happened meanwhile.
 * - The nudge that follows the first join is skipped: the page was drawn a moment ago.
 *   One that follows a rejoin is not — whatever happened while the socket was down
 *   was not heard.
 */
export const LIVE_REFRESH_DELAY_MS = 500;

export type LiveRefresher = {
  /** The server announced a change. */
  nudge(): void;
  /** The channel joined (`true`) or dropped (`false`). */
  live(joined: boolean): void;
  /** The page came into view again. */
  visible(): void;
  stop(): void;
};

export function liveRefresher(refresh: () => void, isHidden: () => boolean): LiveRefresher {
  let joinedBefore = false;
  let skipNext = false;
  let missed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = () => {
    if (timer || stopped) return;
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      if (isHidden()) missed = true;
      else refresh();
    }, LIVE_REFRESH_DELAY_MS);
  };

  return {
    nudge() {
      if (stopped) return;
      if (skipNext) {
        skipNext = false;
        return;
      }
      if (isHidden()) missed = true;
      else schedule();
    },
    live(joined) {
      if (!joined) {
        skipNext = false;
        return;
      }
      skipNext = !joinedBefore;
      joinedBefore = true;
    },
    visible() {
      if (!missed || isHidden()) return;
      missed = false;
      schedule();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
