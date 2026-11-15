import { sendNotification, setVapidDetails } from "web-push";
import { prisma } from "./prisma";

let configured = false;

/**
 * How long one push service may take to accept a message. web-push sets no limit of its
 * own, so a push service that stopped answering held the reminder job — which sends to
 * every due task's assignees in one run — until the platform killed it, and the rows
 * saying who had been told were never written.
 */
export const PUSH_TIMEOUT_MS = 10_000;

/** Hands the VAPID keys to web-push once; false when push is not set up here. */
export function configurePush() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function sendPushToUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    url?: string;
    /** A notification with the same tag replaces the one before it rather than stacking. */
    tag?: string;
    /** Stays on screen until it is dealt with, where the platform honours it. */
    requireInteraction?: boolean;
    /**
     * Replaces the notification with the same tag without a sound or a buzz. Safari on
     * iPhone cannot do that — it would buzz every time — so Apple's devices are left out.
     */
    quiet?: boolean;
  },
) {
  if (!configurePush() || userIds.length === 0) return 0;

  const subscriptions = (await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } })).filter(
    (sub) => !payload.quiet || !isApplePush(sub.endpoint),
  );

  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { timeout: PUSH_TIMEOUT_MS },
        );
        delivered++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }),
  );

  return delivered;
}

/** Safari's push service, which shows every push as a new alert. */
export function isApplePush(endpoint: string) {
  try {
    const host = new URL(endpoint).hostname;
    return host === "push.apple.com" || host.endsWith(".push.apple.com");
  } catch {
    return false;
  }
}
