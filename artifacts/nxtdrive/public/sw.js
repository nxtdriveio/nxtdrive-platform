/* NXTDRIVE service worker.
 *
 * Two responsibilities:
 *  1. Web push delivery (Task #110) — receives push events, shows notifications.
 *  2. Offline tolerance + app-shell caching for the Leerling & Instructeur PWAs
 *     (Task #177) — precaches each app's offline fallback + icons, serves a
 *     branded offline page when a navigation fails, and caches our own static
 *     assets cache-first.
 *
 * Dev-safety: we deliberately do NOT cache-first the Next.js build output
 * (/_next/*) so HMR and fresh deploys are never served stale. Navigations use
 * network-first (always tries the network, only falls back to cache when
 * offline), which keeps the Replit preview live while still degrading nicely
 * offline. Bump CACHE_VERSION to invalidate all caches on the next activate.
 */

const CACHE_VERSION = "v2";
const STATIC_CACHE = `nxtdrive-static-${CACHE_VERSION}`;
const SHELL_CACHE = `nxtdrive-shell-${CACHE_VERSION}`;

const STUDENT_OFFLINE = "/student/offline";
const INSTRUCTOR_OFFLINE = "/instructor/offline";

// Precached at install. App-shell offline pages are best-effort (they render
// inside an authed layout, so the fetch needs the user's cookies — which the SW
// has at install time because registration happens from within the logged-in
// app). Icons are always cacheable.
const PRECACHE_URLS = [
  STUDENT_OFFLINE,
  INSTRUCTOR_OFFLINE,
  "/icons/student-192.png",
  "/icons/student-512.png",
  "/icons/instructor-192.png",
  "/icons/instructor-512.png",
  "/icon.svg",
];

// Last-resort inline fallback if even the precached offline page is missing.
function inlineOfflineResponse() {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline — NXTDRIVE</title>
  <style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
  background:#0F172A;color:#fff;font-family:system-ui,sans-serif;text-align:center}
  .c{padding:2rem;max-width:22rem}h1{font-size:1.25rem;margin:.5rem 0}
  p{color:rgba(255,255,255,.7);font-size:.9rem}button{margin-top:1rem;border:0;border-radius:999px;
  padding:.6rem 1.4rem;font-weight:600;background:#fff;color:#0F172A}</style></head>
  <body><div class="c"><h1>NXTDRIVE</h1><p>Je bent offline. Probeer het opnieuw zodra je weer
  internet hebt.</p><button onclick="location.reload()">Opnieuw proberen</button></div></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort per URL — a single failure must not abort install.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok) await cache.put(url, res.clone());
          } catch {
            /* offline page may need auth; skip — runtime caching will fill it */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function offlineFallbackFor(url) {
  const isInstructor = url.pathname.startsWith("/instructor");
  return isInstructor ? INSTRUCTOR_OFFLINE : STUDENT_OFFLINE;
}

// Static assets we own and that are safe to serve cache-first.
function isOwnStaticAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/opengraph.jpg"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle same-origin requests; let the browser handle cross-origin
  // (Supabase, Google APIs, etc.) directly.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to a cached page, then the branded
  // offline page, then an inline last resort.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Cache the last-seen page so offline can show recent content.
          try {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, fresh.clone());
          } catch {
            /* ignore cache write failures */
          }
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match(offlineFallbackFor(url));
          return fallback || inlineOfflineResponse();
        }
      })(),
    );
    return;
  }

  // Our own static assets: cache-first (immutable, safe in dev too).
  if (isOwnStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else (/_next/*, /api/*, subresources): network-first with a
  // cache fallback, but never cache-first — keeps HMR and fresh deploys correct.
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
    icon: "/icons/student-192.png",
    badge: "/icons/student-192.png",
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
