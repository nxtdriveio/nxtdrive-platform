"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Branded "Add to home screen" banner (Task #197).
 *
 * Chrome/Android only shows a tiny, easily-missed mini-infobar for installable
 * PWAs. This component intercepts the `beforeinstallprompt` event, suppresses the
 * default mini-infobar, and renders our own small, dismissable CTA. Tapping
 * "Installeer" replays the deferred prompt. The dismissal is remembered in
 * `localStorage` (per app) so the banner does not reappear every session.
 *
 * iOS/Safari never fires `beforeinstallprompt`, so the banner simply never shows
 * there — installation on iOS is the manual "Deel → Zet op beginscherm" flow,
 * which Apple does not let us trigger programmatically.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPromptBanner({
  app,
}: {
  app: "student" | "instructor";
}) {
  const storageKey = `nxtdrive-install-dismissed-${app}`;
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
    } catch {
      /* storage blocked (private mode) — just show the banner */
    }

    const onBeforeInstall = (e: Event) => {
      // Stop Chrome's default mini-infobar; we present our own CTA instead.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user dismissed the native dialog — nothing to do */
    } finally {
      setVisible(false);
      setDeferred(null);
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
    }
  };

  if (!visible || !deferred) return null;

  return (
    <div className="px-3 pt-3 sm:px-6">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm lg:max-w-5xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Download className="h-5 w-5" aria-hidden />
        </div>
        <p className="min-w-0 flex-1 text-sm text-foreground">
          Voeg NXTDRIVE toe aan je beginscherm voor snellere toegang.
        </p>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95"
        >
          Installeer
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Sluiten"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
