import { removeSubscription, saveSubscription } from "@/app/actions/push";
import { syncPush, type PushDevice, type PushState, type PushSubscriptionJson } from "@/lib/push-sync";

/**
 * This browser's side of push notifications: whether it can have them, and turning them
 * on. Asked by the offer on the overview and the profile (`NotificationSetup`).
 */

export type { PushState } from "@/lib/push-sync";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function subscribeHere(registration: ServiceWorkerRegistration): Promise<PushSubscriptionJson> {
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
  });
  return subscription.toJSON() as PushSubscriptionJson;
}

/** This browser, as `syncPush` asks about it. */
function thisDevice(): PushDevice {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let registration: Promise<ServiceWorkerRegistration> | null = null;
  const registered = () => (registration ??= navigator.serviceWorker.register("/sw.js"));
  return {
    supported,
    configured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    permission: supported ? Notification.permission : "default",
    async getSubscription() {
      const subscription = await (await registered()).pushManager.getSubscription();
      return subscription ? (subscription.toJSON() as PushSubscriptionJson) : null;
    },
    async subscribe() {
      return subscribeHere(await registered());
    },
    save: (subscription) => saveSubscription({ endpoint: subscription.endpoint, keys: subscription.keys }),
  };
}

let synced: Promise<PushState> | null = null;

/**
 * Where push stands on this device, after putting it right (`syncPush`): a subscription
 * iOS dropped is made again without a prompt, and the one there is saved to the server.
 * Once per page load — the app layout (`PushKeeper`) and the offer (`NotificationSetup`)
 * share the answer.
 */
export function syncPushHere(): Promise<PushState> {
  return (synced ??= syncPush(thisDevice()).catch(() => "unsupported" as const));
}

/** Asks for permission and subscribes. Has to be called from a press: a browser refuses
 *  the permission prompt otherwise. */
export async function turnOnPush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const json = await subscribeHere(await navigator.serviceWorker.register("/sw.js"));
  const state: PushState = (await saveSubscription({ endpoint: json.endpoint, keys: json.keys })) ? "on" : "off";
  synced = Promise.resolve(state);
  return state;
}

/**
 * Stops this browser hearing about the account that is signing out of it: the server
 * forgets the endpoint while the session can still say whose it is, and the browser lets
 * go of the subscription so nothing else can claim it. Never throws and never takes long —
 * it runs on the way out of a log-out press, and a log-out that hung on a push service
 * would be worse than one that left a device subscribed.
 */
export async function forgetPushHere(): Promise<void> {
  synced = null;
  const forget = async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await removeSubscription(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  };
  await Promise.race([forget().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
}
