"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  setTenantNotificationEnabled,
  setTenantNotificationTemplate,
} from "@/lib/notifications/platform-notification-config";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function toggleTenantTrigger(formData: FormData) {
  const { tenant, user } = await requireActiveTenant(["tenant_admin"]);
  const eventKey = formData.get("event_key") as string;
  const channel = formData.get("channel") as string;
  const enabledRaw = formData.get("enabled");

  if (!eventKey || !channel) throw new Error("event_key en channel zijn verplicht");

  const enabled: boolean | null =
    enabledRaw === "true" ? true : enabledRaw === "false" ? false : null;

  const service = createServiceRoleClient();
  await setTenantNotificationEnabled(service, user.id, tenant.id, eventKey, channel, enabled);

  revalidatePath("/backoffice/instellingen/notificaties");
}

export async function saveTenantTemplate(formData: FormData) {
  const { tenant, user } = await requireActiveTenant(["tenant_admin"]);

  const { isWhiteLabelEligible } = await import("@/lib/platform/features");
  const { data: tenantRow } = await createServiceRoleClient()
    .from("tenants")
    .select("plan, white_label_enabled")
    .eq("id", tenant.id)
    .maybeSingle();

  if (
    !isWhiteLabelEligible({
      plan: (tenantRow?.plan as "start" | "pro" | "elite" | undefined) ?? "start",
      white_label_enabled: tenantRow?.white_label_enabled as boolean | null | undefined,
    })
  ) {
    throw new Error("Aanpassen van e-mailtemplates vereist het Elite-abonnement met white-label ingeschakeld.");
  }

  const eventKey = formData.get("event_key") as string;
  const channel = formData.get("channel") as string;
  if (!eventKey || !channel) throw new Error("event_key en channel zijn verplicht");

  const service = createServiceRoleClient();

  const template: Record<string, string | null> = {};
  if (channel === "email") {
    template.subject = (formData.get("subject") as string | null) || null;
    template.bodyHtml = (formData.get("body_html") as string | null) || null;
    template.bodyText = (formData.get("body_text") as string | null) || null;
  } else if (channel === "push") {
    template.pushTitle = (formData.get("push_title") as string | null) || null;
    template.pushBody = (formData.get("push_body") as string | null) || null;
  } else if (channel === "inapp") {
    template.inappTitle = (formData.get("inapp_title") as string | null) || null;
    template.inappBody = (formData.get("inapp_body") as string | null) || null;
  }

  await setTenantNotificationTemplate(service, user.id, tenant.id, eventKey, channel, template);

  redirect(`/backoffice/instellingen/notificaties?saved=${eventKey}:${channel}`);
}
