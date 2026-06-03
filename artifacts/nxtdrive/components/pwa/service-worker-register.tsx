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
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failures must never surface to the user */
    });
  }, []);

  return null;
}
