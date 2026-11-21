"use client";

import { useEffect } from "react";
import { syncPushHere } from "@/lib/push-client";

/**
 * Keeps this device's push notifications alive each time the app opens: a subscription
 * iOS has dropped is made again, without asking, where the person already said yes
 * (`syncPush`). Draws nothing.
 */
export function PushKeeper() {
  useEffect(() => {
    void syncPushHere();
  }, []);
  return null;
}
