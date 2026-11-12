"use client";

import { Analytics } from "@vercel/analytics/next";
import { scrubUrl } from "@/lib/analytics-url";

export function SafeAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })} />;
}
