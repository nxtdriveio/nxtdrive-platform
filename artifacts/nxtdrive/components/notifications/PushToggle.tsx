"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPreference,
} from "@/lib/notifications/push-actions";

/** Decode a base64url VAPID public key into the Uint8Array the PushManager wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "off"
  | "on-elsewhere"
  | "on";

/**
 * Per-device push opt-in with server-side preference persistence.
 *
 * `serverPushEnabled` is the canonical server preference (null = no row yet).
 * - `"on"` — this device has an active push subscription.
 * - `"on-elsewhere"` — server says push is wanted but this device has no
 *   subscription; prompts the user to enable on this device too.
 * - `"off"` — not subscribed and no server preference (or server says off).
 *
 * When the user enables/disables push the server preference is updated in
 * lock-step so future devices get the right initial state.
 */
export function PushToggle({
  vapidPublicKey,
  serverPushEnabled = null,
}: {
  vapidPublicKey: string | null;
  serverPushEnabled?: boolean | null;
}) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    if (!vapidPublicKey) {
      setState("unconfigured");
      return;
    }
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      typeof Notification === "undefined"
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setState("on");
      } else if (serverPushEnabled === true) {
        setState("on-elsewhere");
      } else {
        setState("off");
      }
    } catch {
      setState(serverPushEnabled === true ? "on-elsewhere" : "off");
    }
  }, [vapidPublicKey, serverPushEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function enable() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            vapidPublicKey!,
          ) as BufferSource,
        });
        const json = sub.toJSON();
        const keys = json.keys ?? {};
        if (!json.endpoint || !keys.p256dh || !keys.auth) {
          await sub.unsubscribe().catch(() => undefined);
          setError("Kon het abonnement niet aanmaken.");
          return;
        }
        const res = await subscribeToPush({
          endpoint: json.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: navigator.userAgent,
        });
        if (res.error) {
          await sub.unsubscribe().catch(() => undefined);
          setError(res.error);
          return;
        }
        await updateNotificationPreference(true);
        setState("on");
      } catch {
        setError("Pushmeldingen konden niet worden ingeschakeld.");
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribeFromPush(sub.endpoint);
          await sub.unsubscribe().catch(() => undefined);
        }
        await updateNotificationPreference(false);
        setState("off");
      } catch {
        setError("Pushmeldingen konden niet worden uitgeschakeld.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {state === "on" ? (
              <BellRing className="h-5 w-5" aria-hidden />
            ) : state === "denied" || state === "unsupported" ? (
              <BellOff className="h-5 w-5" aria-hidden />
            ) : (
              <Bell className="h-5 w-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              Pushmeldingen
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ontvang meldingen op dit apparaat, ook als de app gesloten is.
            </p>
          </div>
        </div>

        {state === "loading" && (
          <p className="text-xs text-muted-foreground">Laden…</p>
        )}

        {state === "unconfigured" && (
          <p className="text-xs text-muted-foreground">
            Pushmeldingen zijn nog niet beschikbaar voor deze rijschool.
          </p>
        )}

        {state === "unsupported" && (
          <p className="text-xs text-muted-foreground">
            Deze browser ondersteunt geen pushmeldingen.
          </p>
        )}

        {state === "denied" && (
          <p className="text-xs text-muted-foreground">
            Meldingen zijn geblokkeerd in je browser. Sta ze toe in de
            browserinstellingen om pushmeldingen te ontvangen.
          </p>
        )}

        {state === "off" && (
          <Button size="sm" onClick={enable} disabled={pending}>
            {pending ? "Bezig…" : "Pushmeldingen inschakelen"}
          </Button>
        )}

        {state === "on-elsewhere" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Ingeschakeld op een ander apparaat. Schakel ook in op dit apparaat:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={enable} disabled={pending}>
                {pending ? "Bezig…" : "Inschakelen op dit apparaat"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={disable}
                disabled={pending}
              >
                {pending ? "Bezig…" : "Overal uitschakelen"}
              </Button>
            </div>
          </div>
        )}

        {state === "on" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
              Ingeschakeld op dit apparaat
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={disable}
              disabled={pending}
            >
              {pending ? "Bezig…" : "Uitschakelen"}
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
