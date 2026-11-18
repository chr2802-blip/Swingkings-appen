import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_REFRESH_DELAY_MS, liveRefresher } from "@/lib/live-refresh";

let hidden = false;
let refresh: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  refresh = vi.fn<() => void>();
});
afterEach(() => vi.useRealTimers());

function joined() {
  const refresher = liveRefresher(refresh, () => hidden);
  refresher.live(true);
  refresher.nudge(); // the nudge followTeamSignal sends on joining
  return refresher;
}

describe("liveRefresher", () => {
  it("does not read the page again for the nudge that follows the first join", () => {
    joined();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads the page once for nudges that arrive close together", () => {
    const refresher = joined();
    refresher.nudge();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    refresher.nudge();
    refresher.nudge();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    refresher.nudge();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("reads nothing in the background, and once when looked at again", () => {
    const refresher = joined();
    hidden = true;
    refresher.nudge();
    refresher.nudge();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS * 2);
    expect(refresh).not.toHaveBeenCalled();

    refresher.visible(); // still hidden: a visibilitychange on the way out
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).not.toHaveBeenCalled();

    hidden = false;
    refresher.visible();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    refresher.visible(); // nothing happened since
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("holds a read that falls due after the app went to the background", () => {
    const refresher = joined();
    refresher.nudge();
    hidden = true;
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).not.toHaveBeenCalled();
    hidden = false;
    refresher.visible();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reads the page again after a rejoin, since changes made while the socket was down were not heard", () => {
    const refresher = joined();
    refresher.live(false);
    refresher.live(true);
    refresher.nudge();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reads nothing once stopped, not even a read already waiting", () => {
    const refresher = joined();
    refresher.nudge();
    refresher.stop();
    refresher.nudge();
    refresher.visible();
    vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });
});
