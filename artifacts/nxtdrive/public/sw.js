/* NXTDRIVE service worker — web push delivery surface (Task #110).
 *
 * Scope: "/" (registered from /sw.js). Receives push events whose payload is the
 * JSON produced by lib/notifications/web-push.ts and shows the same copy as the
 * in-app notification. notificationclick focuses an open tab on the target URL
 * or opens a new one. No offline/precaching — this SW exists for push only. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "NXTDRIVE";
  const options = {
    body: data.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || undefined,
    renotify: false,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        // Focus an existing tab and route it to the target.
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(target);
          } catch {
            /* ignore — fall through to openWindow */
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
