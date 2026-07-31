"use server";

import { requireUser } from "@/lib/auth/require-role";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isWebPushConfigured } from "./web-push";
import type { NotificationCategory } from "./types";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

/**
 * Store (idempotently) the calling user's web-push subscription for the active
 * tenant. The locked `upsert_push_subscription` RPC keys on the globally-unique
 * endpoint, so re-subscribing the same browser updates the row rather than
 * duplicating it (and re-points it at the current user after an account switch).
 * Returns an error when push is not configured server-side so the client can
 * surface a graceful message instead of subscribing into a void.
 */
export async function subscribeToPush(
  input: PushSubscriptionInput,
): Promise<{ error?: string }> {
  if (!isWebPushConfigured()) {
    return { error: "Pushmeldingen zijn nog niet geconfigureerd." };
  }

  const endpoint = String(input?.endpoint ?? "").trim();
  const p256dh = String(input?.p256dh ?? "").trim();
  const auth = String(input?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) {
    return { error: "Ongeldig push-abonnement." };
  }

  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return { error: "Geen actieve rijschool" };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_push_subscription", {
    p_tenant_id: tenant.id,
    p_recipient_user_id: user.id,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: input.userAgent ?? null,
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * Remove the calling user's subscription for one endpoint (the user turned push
 * off). Ownership is re-validated inside the RPC: an endpoint belonging to
 * another user/tenant is left untouched.
 */
export async function unsubscribeFromPush(
  endpoint: string,
): Promise<{ error?: string }> {
  const value = String(endpoint ?? "").trim();
  if (!value) return { error: "endpoint ontbreekt" };

  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return { error: "Geen actieve rijschool" };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("delete_push_subscription", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_endpoint: value,
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * Persist the caller's push-notification preference for their active tenant.
 * Uses an upsert so the first call creates the row and subsequent calls update
 * it — no separate "create" step needed.
 *
 * This is intentionally separate from the physical per-device subscription: a
 * user can want push (`push_enabled = true`) but not yet have subscribed on a
 * particular device. The `PushToggle` uses this to show an "enabled elsewhere"
 * prompt on new devices.
 */
export async function updateNotificationPreference(
  pushEnabled: boolean,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return { error: "Geen actieve rijschool" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      tenant_id: tenant.id,
      push_enabled: pushEnabled,
    },
    { onConflict: "user_id,tenant_id" },
  );
  if (error) return { error: error.message };
  return {};
}

/**
 * Read the caller's stored push preference for their active tenant.
 * Returns null when no row exists (first-time user on any device).
 */
export async function getNotificationPreference(): Promise<boolean | null> {
  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("push_enabled")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Pushvoorkeur laden mislukt: ${error.message}`);
  }

  return data?.push_enabled ?? null;
}

/**
 * Read the caller's per-category type preferences for their active tenant.
 * Returns an empty object when no row exists (all categories default to on).
 * The returned object only contains keys where the user explicitly opted out
 * (value = false); absent keys mean opted in.
 */
export async function getNotificationTypePreferences(): Promise<
  Partial<Record<NotificationCategory, boolean>>
> {
  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return {};

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("type_preferences")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Meldingsvoorkeuren laden mislukt: ${error.message}`);
  }

  const raw = data?.type_preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Partial<Record<NotificationCategory, boolean>>;
}

/**
 * Toggle a single notification category on or off for the caller's active
 * tenant. Uses a JSONB merge so other categories are untouched. Safe to call
 * repeatedly — setting a category to true removes any stored opt-out.
 */
export async function updateNotificationTypePreference(
  category: NotificationCategory,
  enabled: boolean,
): Promise<{ error?: string }> {
  const allowedCategories: NotificationCategory[] = [
    "les_herinnering",
    "proefles",
    "tegoed_waarschuwing",
    "examen_updates",
  ];
  if (!allowedCategories.includes(category)) {
    return { error: "Onbekende categorie." };
  }

  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return { error: "Geen actieve rijschool" };

  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("notification_preferences")
    .select("type_preferences")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const current =
    existing?.type_preferences &&
    typeof existing.type_preferences === "object" &&
    !Array.isArray(existing.type_preferences)
      ? (existing.type_preferences as Record<string, boolean>)
      : {};

  const updated = { ...current, [category]: enabled };

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      tenant_id: tenant.id,
      type_preferences: updated,
    },
    { onConflict: "user_id,tenant_id" },
  );
  if (error) return { error: error.message };
  return {};
}
