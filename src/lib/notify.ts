import { after } from "next/server";
import { sendPushToUsers } from "./push";

/**
 * Sends a push notification after the response has gone, so the person who pressed
 * never waits on a push service, and never to the person who caused it.
 *
 * Without VAPID keys (a laptop, the tests) nothing is sent and nothing fails.
 */
export function notifyLater(
  userIds: string[],
  actorId: string | null,
  payload: { title: string; body: string; url?: string; tag?: string },
) {
  const to = [...new Set(userIds)].filter((id) => id !== actorId);
  if (to.length === 0 || !process.env.VAPID_PRIVATE_KEY) return;
  after(() =>
    sendPushToUsers(to, payload).catch((error) =>
      console.error(JSON.stringify({ event: "push_failed", error: String(error) })),
    ),
  );
}
