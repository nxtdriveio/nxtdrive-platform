import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cache } from "react";
import { sendWebPushToUser } from "./web-push";
import { isTenantTriggerEnabled } from "./platform-notification-config";
import { interpolate } from "./templates";
import type { InAppContent, InAppNotification, NotificationCategory } from "./types";
import { NOTIFICATION_TYPE_CATEGORY } from "./types";

/**
 * Check whether a recipient user has opted in to a notification type. Looks up
 * the `type_preferences` JSONB on `notification_preferences`. When no row
 * exists or the category is absent from the JSONB, the user is considered
 * opted in (default-on). Staff-facing types (no category entry in
 * NOTIFICATION_TYPE_CATEGORY) always pass through.
 *
 * Uses the service-role client so it can read across tenants as needed.
 * Returns true (allow) or false (suppress).
 */
async function isTypeAllowed(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
  notificationType: string,
): Promise<boolean> {
  const category = NOTIFICATION_TYPE_CATEGORY[notificationType as keyof typeof NOTIFICATION_TYPE_CATEGORY] as
    | NotificationCategory
    | undefined;
  if (!category) return true;

  const { data } = await service
    .from("notification_preferences")
    .select("type_preferences")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const prefs = data?.type_preferences;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return true;
  const stored = (prefs as Record<string, unknown>)[category];
  return stored !== false;
}

/**
 * Enqueue the in-app copy of a notification. Idempotent per (tenant, dedupe key)
 * via the `enqueue_app_notification` RPC: a retried dispatch / re-run never
 * double-notifies. Degrades gracefully (no-op) when there is no recipient user
 * (e.g. a lead with no account) so it can be wired into every dispatch path
 * unconditionally.
 *
 * Respects per-category type preferences: when the recipient has opted out of
 * the notification category that covers this type, both the in-app enqueue and
 * the web-push send are skipped.
 *
 * Service-role only — the RPC is locked down to service_role. Never throws: an
 * in-app failure must never break the surrounding action or its email.
 */
export async function dispatchInApp(
  service: SupabaseClient,
  params: {
    tenantId: string;
    type: string;
    dedupeKey: string;
    relatedType?: string | null;
    relatedId?: string | null;
    payload?: Record<string, unknown>;
    inApp: InAppContent | null | undefined;
  },
): Promise<{ created: boolean } | { skipped: true }> {
  const inApp = params.inApp;
  if (!inApp || !inApp.recipientUserId) return { skipped: true };

  // Gate: global platform flag + tenant override voor het inapp-kanaal.
  const inappEnabled = await isTenantTriggerEnabled(
    service,
    params.tenantId,
    params.type,
    "inapp",
  ).catch(() => true);
  if (!inappEnabled) return { skipped: true };

  const allowed = await isTypeAllowed(
    service,
    params.tenantId,
    inApp.recipientUserId,
    params.type,
  ).catch(() => true);
  if (!allowed) return { skipped: true };

  // Template override lookup (parallel): tenant row → platform default → call-site value.
  // Both in-app and push overrides are loaded in a single fan-out so we can apply
  // them to the enqueue call and the web-push send respectively.
  const [tenantTemplates, platformInapp, platformPush] = await Promise.all([
    service
      .from("notification_templates")
      .select("channel, inapp_title, inapp_body, push_title, push_body")
      .eq("tenant_id", params.tenantId)
      .eq("key", params.type)
      .in("channel", ["inapp", "push"])
      .then((r) => (r.data ?? []) as Array<Record<string, string | null>>),
    service
      .from("platform_notification_config")
      .select("inapp_title, inapp_body")
      .eq("event_key", params.type)
      .eq("channel", "inapp")
      .maybeSingle()
      .then((r) => r.data as Record<string, string | null> | null),
    service
      .from("platform_notification_config")
      .select("push_title, push_body")
      .eq("event_key", params.type)
      .eq("channel", "push")
      .maybeSingle()
      .then((r) => r.data as Record<string, string | null> | null),
  ]).catch(() => [[] as Array<Record<string, string | null>>, null, null] as const);

  const tenantInapp = Array.isArray(tenantTemplates)
    ? tenantTemplates.find((t) => t.channel === "inapp") ?? null
    : null;
  const tenantPush = Array.isArray(tenantTemplates)
    ? tenantTemplates.find((t) => t.channel === "push") ?? null
    : null;

  // Resolved in-app content: tenant override → platform default → call-site value.
  // Shortcode interpolation ({{student_name}} etc.) is applied to all three tiers
  // using the caller-supplied vars. Pre-rendered call-site strings are unaffected
  // because they contain no {{...}} placeholders.
  const vars = inApp.vars ?? {};
  const resolvedTitle = interpolate(
    tenantInapp?.inapp_title || platformInapp?.inapp_title || inApp.title,
    vars,
  );
  const resolvedBody = interpolate(
    tenantInapp?.inapp_body || platformInapp?.inapp_body || inApp.body,
    vars,
  );

  const { data, error } = await service.rpc("enqueue_app_notification", {
    p_tenant_id: params.tenantId,
    p_recipient_user_id: inApp.recipientUserId,
    p_type: params.type,
    p_title: resolvedTitle,
    p_body: resolvedBody,
    p_link: inApp.link,
    p_dedupe_key: params.dedupeKey,
    p_related_type: params.relatedType ?? null,
    p_related_id: params.relatedId ?? null,
    p_payload: params.payload ?? {},
  });
  if (error) {
    console.error("[in-app] enqueue failed", {
      type: params.type,
      dedupeKey: params.dedupeKey,
      error: error.message,
    });
    return { skipped: true };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const created = Boolean(row?.was_created);

  // Second delivery surface: when (and only when) a NEW in-app row was created,
  // also push it to the user's subscribed browsers/PWAs. Gating on `created`
  // preserves idempotency — a retried dispatch re-asserts the in-app row but
  // never re-pushes. Push channel has its own independent gate so disabling
  // push does not affect in-app, and vice versa.
  // Push content: tenant push override → platform push default → resolved in-app title/body.
  if (created) {
    const pushEnabled = await isTenantTriggerEnabled(
      service,
      params.tenantId,
      params.type,
      "push",
    ).catch(() => true);

    if (pushEnabled) {
      const pushTitle = interpolate(
        tenantPush?.push_title || platformPush?.push_title || resolvedTitle,
        vars,
      );
      const pushBody = interpolate(
        tenantPush?.push_body || platformPush?.push_body || resolvedBody,
        vars,
      );

      try {
        await sendWebPushToUser(service, {
          tenantId: params.tenantId,
          userId: inApp.recipientUserId,
          title: pushTitle,
          body: pushBody,
          link: inApp.link,
          type: params.type,
          dedupeKey: params.dedupeKey,
        });
      } catch (err) {
        console.error("[in-app] web push dispatch failed", {
          type: params.type,
          dedupeKey: params.dedupeKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { created };
}

/**
 * Load the current user's in-app notifications for the bell / overview. Goes
 * through the anon-key server client so RLS enforces "own rows only" — there is
 * no application-side recipient filter to forget. Returns the most recent N rows
 * plus an exact unread count (counted separately so it is not capped by N).
 */
const loadInAppNotificationsCached = cache(async (
  tenantId: string,
  limit: number,
): Promise<{ items: InAppNotification[]; unreadCount: number }> => {
  const supabase = await createServerSupabaseClient();

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("app_notifications")
      .select(
        "id, type, title, body, link, related_type, related_id, read_at, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("read_at", null),
  ]);

  const items: InAppNotification[] = (data ?? []).map((r) => ({
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    body: (r.body as string | null) ?? "",
    link: (r.link as string | null) ?? null,
    relatedType: (r.related_type as string | null) ?? null,
    relatedId: (r.related_id as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  return { items, unreadCount: count ?? 0 };
});

export async function loadInAppNotifications(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<{ items: InAppNotification[]; unreadCount: number }> {
  return loadInAppNotificationsCached(tenantId, opts.limit ?? 20);
}

/** Compact NL date+time for in-app bodies (e.g. "ma 8 jun 14:30"). */
export function formatWhenNL(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
