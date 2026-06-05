"use server";

import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  updatePlatformNotificationConfig,
} from "@/lib/notifications/platform-notification-config";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function toggleGlobalTrigger(formData: FormData) {
  const user = await requirePlatformAdmin();
  const eventKey = formData.get("event_key") as string;
  const channel = formData.get("channel") as string;
  const enabled = formData.get("enabled") === "true";

  if (!eventKey || !channel) throw new Error("event_key en channel zijn verplicht");

  const service = createServiceRoleClient();
  await updatePlatformNotificationConfig(service, user.id, eventKey, channel, {
    globallyEnabled: enabled,
  });

  revalidatePath("/admin/notifications");
}

export async function savePlatformTemplate(formData: FormData) {
  const user = await requirePlatformAdmin();
  const eventKey = formData.get("event_key") as string;
  const channel = formData.get("channel") as string;

  if (!eventKey || !channel) throw new Error("event_key en channel zijn verplicht");

  const service = createServiceRoleClient();

  const patch: Record<string, string | null> = {};
  if (channel === "email") {
    const subject = formData.get("subject") as string | null;
    const bodyHtml = formData.get("body_html") as string | null;
    const bodyText = formData.get("body_text") as string | null;
    patch.subject = subject || null;
    patch.bodyHtml = bodyHtml || null;
    patch.bodyText = bodyText || null;
  } else if (channel === "push") {
    const pushTitle = formData.get("push_title") as string | null;
    const pushBody = formData.get("push_body") as string | null;
    patch.pushTitle = pushTitle || null;
    patch.pushBody = pushBody || null;
  } else if (channel === "inapp") {
    const inappTitle = formData.get("inapp_title") as string | null;
    const inappBody = formData.get("inapp_body") as string | null;
    patch.inappTitle = inappTitle || null;
    patch.inappBody = inappBody || null;
  }

  await updatePlatformNotificationConfig(service, user.id, eventKey, channel, patch);

  redirect(`/admin/notifications?saved=${eventKey}:${channel}`);
}
