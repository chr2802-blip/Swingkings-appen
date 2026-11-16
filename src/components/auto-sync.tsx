"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { autoSyncCalendar } from "@/app/actions/activities";

/**
 * Brings KampKlar in when the page is opened: the server fetches the feed if it has not
 * lately, and the page is read again once it has. Nothing is shown while it runs; a
 * failed fetch leaves the page as it was.
 */
export function AutoSync() {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    autoSyncCalendar()
      .then((result) => {
        if (live && result.synced) router.refresh();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [router]);
  return null;
}
