/*
 * The service worker: push notifications, nothing else. Fines, challenges, new jobs,
 * chat messages and an admin's own notices arrive here as a JSON payload from `src/lib/push.ts`.
 * One opened is read in the notification center too (`/api/notifications/read`).
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Swingkings";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Der er nyt på holdet.",
      icon: "/icon-192.png",
      badge: "/badge.png",
      tag: data.tag,
      // A quiet one updates the notification already there (the chat's "7 nye beskeder")
      // without buzzing again; a full one does buzz, even when it replaces another.
      renotify: Boolean(data.tag) && !data.quiet,
      silent: Boolean(data.quiet),
      requireInteraction: Boolean(data.requireInteraction),
      data: { url: data.url || "/oversigt", notificationId: data.notificationId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Opening the push reads it in the notification center as well.
  const notificationId = event.notification.data?.notificationId;
  const markRead = notificationId
    ? fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notificationId }),
      }).catch(() => {})
    : Promise.resolve();
  event.waitUntil(markRead);
  const target = new URL(event.notification.data?.url || "/oversigt", self.location.origin);
  const url = target.href;
  // A link outside the app (MobilePay, a club page) opens on its own, and the app stays put.
  if (target.origin !== self.location.origin) {
    event.waitUntil(self.clients.openWindow(url));
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
