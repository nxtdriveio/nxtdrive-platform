"use client";

import { useEffect } from "react";

/**
 * Registers the NXTDRIVE service worker (/sw.js, scope "/") once on the client.
 * Mounted inside the student and instructor app shells so push delivery works in
 * both PWAs. Silent and best-effort: browsers without service-worker support
 * (or insecure contexts) simply skip registration — the rest of the app is
 * unaffected.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // `updateViaCache: 'none'` makes the browser bypass its HTTP cache when it
    // checks /sw.js for updates, so a freshly deployed worker is picked up on the
    // next navigation instead of waiting out the server's Cache-Control max-age.
    // Lighthouse and PWA best-practice both expect this.
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => {
        /* registration failures must never surface to the user */
      });
  }, []);

  return null;
}
