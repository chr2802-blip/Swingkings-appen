"use client";

import { useEffect } from "react";
import { markFeedSeen } from "@/app/actions/social";

/** Marks the feed as seen once `#feed` has scrolled into view. */
export function FeedSeen() {
  useEffect(() => {
    const feed = document.getElementById("feed");
    if (!feed || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void markFeedSeen();
      }
    });
    observer.observe(feed);
    return () => observer.disconnect();
  }, []);
  return null;
}
