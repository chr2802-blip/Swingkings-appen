"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { followTeamSignal } from "@/components/team-signal";
import { liveRefresher } from "@/lib/live-refresh";

/**
 * Keeps a server-rendered page current while it is open: when a teammate changes what it
 * shows (the server announces one of `events` on the team's channel), the page is read
 * again with `router.refresh()`, which keeps what is typed and what is open. The rules
 * for when are `liveRefresher`'s. Renders nothing; without Realtime it does nothing.
 */
export function LiveRefresh({ events }: { events: readonly string[] }) {
  const router = useRouter();
  const key = events.join(",");

  useEffect(() => {
    const refresher = liveRefresher(
      () => router.refresh(),
      () => document.visibilityState === "hidden",
    );
    const onVisible = () => refresher.visible();
    document.addEventListener("visibilitychange", onVisible);
    const leave = followTeamSignal(key.split(","), () => refresher.nudge(), (joined) => refresher.live(joined));
    return () => {
      leave();
      refresher.stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, key]);

  return null;
}
