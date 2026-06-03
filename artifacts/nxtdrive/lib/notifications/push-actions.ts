"use server";

import { requireUser } from "@/lib/auth/require-role";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isWebPushConfigured } from "./web-push";

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
