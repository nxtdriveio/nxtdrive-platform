import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Web-push delivery, layered on top of the in-app notification channel.
 *
 * Web push is the SECOND delivery surface for an in-app notification: whenever a
 * NEW in-app message is created for a user (see `dispatchInApp`), the same copy
 * is pushed to every browser/PWA the user has subscribed. Idempotency is owned
 * by the in-app layer (a retried dispatch re-asserts the in-app row but does not
 * re-push), so this module sends unconditionally for the subscriptions it finds.
 *
 * Degrades gracefully: when VAPID is not configured (no keys) every entry point
 * is a silent no-op. It NEVER throws — a push failure must not break the
 * surrounding action, its email, or its in-app message. Dead/expired
 * subscriptions (404/410 from the push service) are pruned so a stale endpoint
 * never wedges future sends.
 */

let vapidState: "unconfigured" | "configured" | null = null;

const DEFAULT_VAPID_SUBJECT = "mailto:noreply@nxtdrive.io";

/**
 * Lazily wire VAPID details from secrets exactly once. Returns whether web push
 * is configured. Safe to call repeatedly.
 */
function ensureConfigured(): boolean {
  if (vapidState !== null) return vapidState === "configured";

  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || DEFAULT_VAPID_SUBJECT;

  if (!publicKey || !privateKey) {
    vapidState = "unconfigured";
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidState = "configured";
    return true;
  } catch (err) {
    console.error("[web-push] invalid VAPID configuration — push disabled", {
      error: err instanceof Error ? err.message : String(err),
    });
    vapidState = "unconfigured";
    return false;
  }
}

/** Whether web push is configured (VAPID keys present and valid). */
export function isWebPushConfigured(): boolean {
  return ensureConfigured();
}

/**
 * The browser-safe VAPID public key, or null when push is not configured. The
 * client needs this to create a PushSubscription. It is NOT a secret.
 */
export function getVapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] || null;
}

export type WebPushMessage = {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  /** In-app path opened on click (e.g. /student/lessons). */
  link: string | null;
  type: string;
  /** Stable per-event key; doubles as the notification tag for collapsing. */
  dedupeKey: string;
};

/**
 * Send a web-push notification to every subscription of a single user (scoped to
 * the tenant). No-op when push is unconfigured or the user has no subscriptions.
 * Prunes subscriptions the push service reports as gone (404/410). Never throws.
 */
export async function sendWebPushToUser(
  service: SupabaseClient,
  msg: WebPushMessage,
): Promise<void> {
  if (!ensureConfigured()) return;
  if (!msg.userId) return;

  const { data, error } = await service
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("tenant_id", msg.tenantId)
    .eq("recipient_user_id", msg.userId);

  if (error) {
    console.error("[web-push] failed to load subscriptions", {
      tenantId: msg.tenantId,
      userId: msg.userId,
      error: error.message,
    });
    return;
  }

  const subs = data ?? [];
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: msg.title,
    body: msg.body,
    url: msg.link ?? "/",
    type: msg.type,
    tag: msg.dedupeKey,
  });

  await Promise.all(
    subs.map(async (s) => {
      const endpoint = s.endpoint as string;
      try {
        await webpush.sendNotification(
          {
            endpoint,
            keys: {
              p256dh: s.p256dh as string,
              auth: s.auth as string,
            },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
      } catch (err) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          // Gone — the browser unsubscribed or the endpoint expired. Prune so it
          // never wedges future sends. Best-effort; ignore prune errors.
          await service
            .rpc("prune_push_subscription", { p_endpoint: endpoint })
            .then(
              () => undefined,
              () => undefined,
            );
        } else {
          console.error("[web-push] send failed", {
            tenantId: msg.tenantId,
            userId: msg.userId,
            statusCode: statusCode ?? "unknown",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );
}
