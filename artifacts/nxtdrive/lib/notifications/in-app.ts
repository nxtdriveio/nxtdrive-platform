import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendWebPushToUser } from "./web-push";
import type { InAppContent, InAppNotification } from "./types";

/**
 * Enqueue the in-app copy of a notification. Idempotent per (tenant, dedupe key)
 * via the `enqueue_app_notification` RPC: a retried dispatch / re-run never
 * double-notifies. Degrades gracefully (no-op) when there is no recipient user
 * (e.g. a lead with no account) so it can be wired into every dispatch path
 * unconditionally.
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

  const { data, error } = await service.rpc("enqueue_app_notification", {
    p_tenant_id: params.tenantId,
    p_recipient_user_id: inApp.recipientUserId,
    p_type: params.type,
    p_title: inApp.title,
    p_body: inApp.body,
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
  // never re-pushes. Best-effort and never throws: a push failure must not break
  // the in-app message or the surrounding email.
  if (created) {
    try {
      await sendWebPushToUser(service, {
        tenantId: params.tenantId,
        userId: inApp.recipientUserId,
        title: inApp.title,
        body: inApp.body,
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

  return { created };
}

/**
 * Load the current user's in-app notifications for the bell / overview. Goes
 * through the anon-key server client so RLS enforces "own rows only" — there is
 * no application-side recipient filter to forget. Returns the most recent N rows
 * plus an exact unread count (counted separately so it is not capped by N).
 */
export async function loadInAppNotifications(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<{ items: InAppNotification[]; unreadCount: number }> {
  const limit = opts.limit ?? 20;
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
