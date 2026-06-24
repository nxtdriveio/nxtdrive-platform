"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { retryNotificationDelivery } from "@/lib/notifications/delivery";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function retryNotificationDeliveryAction(formData: FormData) {
  const { tenant, user } = await requireActiveTenant(["tenant_admin"]);
  const notificationId = String(formData.get("notification_id") ?? "");
  if (!notificationId) throw new Error("notification_id is verplicht.");

  const service = createServiceRoleClient();
  const result = await retryNotificationDelivery(service, {
    tenantId: tenant.id,
    actorUserId: user.id,
    notificationId,
  });

  revalidatePath("/backoffice/instellingen/notificaties/delivery");
  redirect(
    `/backoffice/instellingen/notificaties/delivery?retry=${result.outcome}`,
  );
}
