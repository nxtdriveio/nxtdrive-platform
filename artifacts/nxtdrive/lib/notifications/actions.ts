"use server";

import { requireUser } from "@/lib/auth/require-role";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Mark a single in-app notification (belonging to the calling user) as read.
 * The locked `mark_app_notification_read` RPC re-validates ownership against the
 * acting user, so a forged id from another user/tenant is rejected server-side;
 * this action only resolves + forwards the actor and active tenant.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ error?: string }> {
  const id = String(notificationId ?? "").trim();
  if (!id) return { error: "id ontbreekt" };

  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return { error: "Geen actieve rijschool" };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("mark_app_notification_read", {
    p_id: id,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * Mark all of the calling user's unread in-app notifications (in the active
 * tenant) as read. Ownership is enforced inside the RPC.
 */
export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) return { error: "Geen actieve rijschool" };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("mark_all_app_notifications_read", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { error: error.message };
  return {};
}
