/**
 * What this device's push notifications should be, decided without touching a browser
 * (`src/lib/push-client.ts` hands in the real one).
 *
 * The permission and the subscription are two things. The permission stays; the
 * subscription — the address at the push service the server posts to — does not: Safari
 * on iPhone drops it after an iOS update, when the home-screen app is put back, or when
 * it clears an unused web app's data, and the server forgets one the push service says
 * is gone (404/410). Asking "is there a subscription?" alone sent everybody back to
 * "Slå til" each time that happened. So while the permission is granted:
 *
 * - no subscription: make a new one at once — no prompt is shown when permission is
 *   already given — and save it;
 * - a subscription: save it again, so the server holds this device's current address,
 *   under whoever is signed in now.
 */

export type PushState = "unsupported" | "unconfigured" | "off" | "on" | "blocked";

export type PushSubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string } };

export type PushDevice = {
  /** Has a service worker and PushManager: on iPhone only the home-screen app does. */
  supported: boolean;
  /** The server's VAPID public key is set. */
  configured: boolean;
  permission: NotificationPermission;
  getSubscription(): Promise<PushSubscriptionJson | null>;
  /** Only ever called while permission is "granted", so it shows no prompt. */
  subscribe(): Promise<PushSubscriptionJson>;
  save(subscription: PushSubscriptionJson): Promise<boolean>;
};

export async function syncPush(device: PushDevice): Promise<PushState> {
  if (!device.supported) return "unsupported";
  if (!device.configured) return "unconfigured";
  if (device.permission === "denied") return "blocked";
  if (device.permission !== "granted") return "off";
  try {
    const subscription = (await device.getSubscription()) ?? (await device.subscribe());
    return (await device.save(subscription)) ? "on" : "off";
  } catch {
    return "off";
  }
}
