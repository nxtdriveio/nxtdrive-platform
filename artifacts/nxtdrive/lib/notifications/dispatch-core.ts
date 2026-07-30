import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { dispatchInApp } from "./in-app";
import { isTenantTriggerEnabled } from "./platform-notification-config";
import { sendEmail } from "./provider";
import type {
  DispatchOutcome,
  InAppContent,
  NotificationType,
  RenderedEmail,
  TemplateOverride,
} from "./types";

type EnqueueRow = { id: string; status: string };

export async function loadNotificationOverride(
  service: SupabaseClient,
  tenantId: string,
  key: NotificationType,
): Promise<TemplateOverride> {
  const [tenantRow, platformRow] = await Promise.all([
    service
      .from("notification_templates")
      .select("subject, body_html, body_text, enabled")
      .eq("tenant_id", tenantId)
      .eq("key", key)
      .eq("channel", "email")
      .maybeSingle(),
    service
      .from("platform_notification_config")
      .select("subject, body_html, body_text")
      .eq("event_key", key)
      .eq("channel", "email")
      .maybeSingle(),
  ]);
  const tenantData = tenantRow.data;
  const platformData = platformRow.data;
  if (
    !tenantData &&
    !platformData?.body_html &&
    !platformData?.subject
  ) {
    return null;
  }
  return {
    subject:
      (tenantData?.subject as string | null) ??
      (platformData?.subject as string | null) ??
      null,
    bodyHtml:
      (tenantData?.body_html as string | null) ??
      (platformData?.body_html as string | null) ??
      null,
    bodyText:
      (tenantData?.body_text as string | null) ??
      (platformData?.body_text as string | null) ??
      null,
    enabled: tenantData ? Boolean(tenantData.enabled) : true,
  };
}

export type NotificationDeliveryParams = {
  tenantId: string;
  type: NotificationType;
  recipientEmail: string;
  dedupeKey: string;
  relatedType: string | null;
  relatedId: string | null;
  email: RenderedEmail;
  fromName: string;
  payload: Record<string, unknown>;
  inApp?: InAppContent | null;
};

export async function deliverNotification(
  service: SupabaseClient,
  params: NotificationDeliveryParams,
): Promise<{ outcome: DispatchOutcome }> {
  if (params.inApp) {
    await dispatchInApp(service, {
      tenantId: params.tenantId,
      type: params.type,
      dedupeKey: params.dedupeKey,
      relatedType: params.relatedType,
      relatedId: params.relatedId,
      payload: params.payload,
      inApp: params.inApp,
    });
  }

  const emailEnabled = await isTenantTriggerEnabled(
    service,
    params.tenantId,
    params.type,
    "email",
  ).catch(() => true);
  if (!emailEnabled) return { outcome: "skipped" };

  const { data, error } = await service.rpc("enqueue_notification_v2", {
    p_tenant_id: params.tenantId,
    p_channel: "email",
    p_type: params.type,
    p_recipient_email: params.recipientEmail,
    p_subject: params.email.subject,
    p_dedupe_key: params.dedupeKey,
    p_related_type: params.relatedType,
    p_related_id: params.relatedId,
    p_payload: params.payload,
    p_body_html: params.email.html,
    p_body_text: params.email.text,
  });
  if (error) {
    console.error("[notifications] enqueue_notification_v2 failed", error);
    return { outcome: "enqueue_failed" };
  }
  const row = (data as EnqueueRow[] | null)?.[0];
  if (!row) return { outcome: "enqueue_failed" };
  if (row.status === "sent") return { outcome: "already_sent" };

  if (!params.recipientEmail) {
    const marked = await markStatus(service, row.id, params.tenantId, {
      status: "skipped",
      provider: null,
      providerMessageId: null,
      error: "missing_recipient_email",
    });
    return {
      outcome: marked ? "skipped_no_recipient" : "status_update_failed",
    };
  }

  const email = appendOpenTrackingPixel(
    params.email,
    params.tenantId,
    row.id,
  );
  const platformConfig = await getPlatformEmailConfig(service).catch(
    () => null,
  );
  const result = await sendEmail({
    to: params.recipientEmail,
    fromName: params.fromName,
    email,
    platformConfig: platformConfig ?? undefined,
  });

  if (result.ok) {
    const marked = await markStatus(service, row.id, params.tenantId, {
      status: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: null,
    });
    if (!marked) {
      console.error(
        "[notifications] email sent but status update failed — manual reconciliation needed",
        {
          id: row.id,
          tenantId: params.tenantId,
          dedupeKey: params.dedupeKey,
        },
      );
      return { outcome: "status_update_failed" };
    }
    return { outcome: "sent" };
  }

  const status: "skipped" | "failed" = result.skipped
    ? "skipped"
    : "failed";
  const marked = await markStatus(service, row.id, params.tenantId, {
    status,
    provider: result.provider,
    providerMessageId: null,
    error: result.error,
  });
  return { outcome: marked ? status : "status_update_failed" };
}

type MarkStatusArgs = {
  status: "sent" | "failed" | "skipped";
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
};

async function markStatus(
  service: SupabaseClient,
  id: string,
  tenantId: string,
  args: MarkStatusArgs,
): Promise<boolean> {
  const { error } = await service.rpc("mark_notification_status", {
    p_id: id,
    p_tenant_id: tenantId,
    p_status: args.status,
    p_provider: args.provider,
    p_provider_message_id: args.providerMessageId,
    p_error: args.error,
  });
  if (error) {
    console.error("[notifications] mark_notification_status failed", {
      id,
      tenantId,
      status: args.status,
      error,
    });
    return false;
  }
  return true;
}

function appendOpenTrackingPixel(
  email: RenderedEmail,
  tenantId: string,
  notificationId: string,
): RenderedEmail {
  const origin = publicAppOrigin();
  if (!origin) return email;
  const src = `${origin}/api/notifications/open/${encodeURIComponent(tenantId)}/${encodeURIComponent(notificationId)}`;
  const pixel = `<img src="${src}" width="1" height="1" alt="" style="display:none!important;opacity:0;width:1px;height:1px;border:0;" />`;
  const html = email.html.includes("</body>")
    ? email.html.replace("</body>", `${pixel}</body>`)
    : `${email.html}${pixel}`;
  return { ...email, html };
}

export function publicAppOrigin(): string {
  const override = process.env["NEXT_PUBLIC_APP_URL"];
  if (override) return override.replace(/\/+$/, "");
  const deployed = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (deployed) return `https://${deployed}`;
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return "";
}
