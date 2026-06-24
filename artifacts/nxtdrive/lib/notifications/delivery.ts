import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { loadEmailBranding } from "./branding";
import { sendEmail } from "./provider";

export type DeliveryStatus = "queued" | "sent" | "failed" | "skipped";

export type NotificationDeliveryFilters = {
  status?: DeliveryStatus | "all";
  channel?: string;
  type?: string;
  q?: string;
};

export type NotificationDeliverySummary = {
  sent: number;
  opened: number;
  failed: number;
  queued: number;
  skipped: number;
  inAppRead: number;
};

export type NotificationDeliveryRow = {
  id: string;
  channel: string;
  type: string;
  recipientEmail: string;
  subject: string;
  status: DeliveryStatus;
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  relatedType: string | null;
  relatedId: string | null;
  retryCount: number;
  lastRetryAt: string | null;
  lastRetryError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  openedAt: string | null;
  canRetry: boolean;
  retryBlockedReason: string | null;
};

type NotificationDeliveryDbRow = {
  id: string;
  channel: string | null;
  type: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: DeliveryStatus | null;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  related_type: string | null;
  related_id: string | null;
  retry_count: number | null;
  last_retry_at: string | null;
  last_retry_error: string | null;
  body_html: string | null;
  body_text: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  opened_at: string | null;
};

export async function loadNotificationDeliveryDashboard(
  service: SupabaseClient,
  tenantId: string,
  filters: NotificationDeliveryFilters = {},
): Promise<{
  summary: NotificationDeliverySummary;
  rows: NotificationDeliveryRow[];
  types: string[];
}> {
  const [sent, failed, queued, skipped, opened, inAppRead, rowsResult] =
    await Promise.all([
      countEmailStatus(service, tenantId, "sent"),
      countEmailStatus(service, tenantId, "failed"),
      countEmailStatus(service, tenantId, "queued"),
      countEmailStatus(service, tenantId, "skipped"),
      countOpenedEmail(service, tenantId),
      countReadInApp(service, tenantId),
      loadRows(service, tenantId, filters),
    ]);

  const q = filters.q?.trim().toLowerCase();
  const rows = q
    ? rowsResult.filter((row) =>
        [
          row.recipientEmail,
          row.subject,
          row.type,
          row.provider ?? "",
          row.error ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : rowsResult;

  return {
    summary: {
      sent,
      failed,
      queued,
      skipped,
      opened: opened + inAppRead,
      inAppRead,
    },
    rows,
    types: Array.from(new Set(rowsResult.map((row) => row.type))).sort(),
  };
}

export async function retryNotificationDelivery(
  service: SupabaseClient,
  args: {
    tenantId: string;
    actorUserId: string;
    notificationId: string;
  },
): Promise<{ outcome: "sent" | "failed" | "blocked"; message: string }> {
  const { data, error } = await service
    .from("notification_log")
    .select(
      "id, tenant_id, channel, type, recipient_email, subject, status, body_html, body_text, retry_count",
    )
    .eq("id", args.notificationId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();

  if (error) throw new Error(`Notificatie laden mislukt: ${error.message}`);
  if (!data) throw new Error("Notificatie niet gevonden.");

  const row = data as {
    id: string;
    channel: string | null;
    type: string | null;
    recipient_email: string | null;
    subject: string | null;
    status: DeliveryStatus | null;
    body_html: string | null;
    body_text: string | null;
  };

  const blocked = getRetryBlockedReason({
    status: row.status ?? "queued",
    channel: row.channel ?? "email",
    recipientEmail: row.recipient_email ?? "",
    bodyHtml: row.body_html,
    bodyText: row.body_text,
  });
  if (blocked) {
    await auditRetry(service, args, "notification.retry_blocked", {
      reason: blocked,
      status: row.status,
      channel: row.channel,
      type: row.type,
    });
    return { outcome: "blocked", message: blocked };
  }

  const { error: reserveError } = await service.rpc("start_notification_retry", {
    p_id: args.notificationId,
    p_tenant_id: args.tenantId,
    p_actor_user_id: args.actorUserId,
  });
  if (reserveError) {
    throw new Error(`Retry starten mislukt: ${reserveError.message}`);
  }

  const [branding, platformConfig] = await Promise.all([
    loadEmailBranding(service, args.tenantId),
    getPlatformEmailConfig(service).catch(() => null),
  ]);

  const result = await sendEmail({
    to: row.recipient_email ?? "",
    fromName: branding.tenantName,
    email: appendOpenTrackingPixel(
      {
        subject: row.subject ?? "",
        html: row.body_html ?? "",
        text: row.body_text ?? "",
      },
      args.tenantId,
      args.notificationId,
    ),
    platformConfig: platformConfig ?? undefined,
  });

  if (result.ok) {
    await markDeliveryStatus(service, args.notificationId, args.tenantId, {
      status: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: null,
    });
    await auditRetry(service, args, "notification.retry_sent", {
      provider: result.provider,
      provider_message_id: result.providerMessageId,
    });
    return { outcome: "sent", message: "Notificatie opnieuw verzonden." };
  }

  await markDeliveryStatus(service, args.notificationId, args.tenantId, {
    status: "failed",
    provider: result.provider,
    providerMessageId: null,
    error: result.error,
  });
  await auditRetry(service, args, "notification.retry_failed", {
    provider: result.provider,
    skipped: result.skipped,
    error: result.error,
  });
  return {
    outcome: "failed",
    message: `Opnieuw proberen mislukt: ${result.error}`,
  };
}

async function loadRows(
  service: SupabaseClient,
  tenantId: string,
  filters: NotificationDeliveryFilters,
): Promise<NotificationDeliveryRow[]> {
  let query = service
    .from("notification_log")
    .select(
      "id, channel, type, recipient_email, subject, status, provider, provider_message_id, error, related_type, related_id, retry_count, last_retry_at, last_retry_error, body_html, body_text, created_at, updated_at, sent_at, opened_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.channel && filters.channel !== "all") {
    query = query.eq("channel", filters.channel);
  }
  if (filters.type && filters.type !== "all") {
    query = query.eq("type", filters.type);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Notificatieleveringen laden mislukt: ${error.message}`);

  return ((data ?? []) as NotificationDeliveryDbRow[]).map(mapDeliveryRow);
}

async function countEmailStatus(
  service: SupabaseClient,
  tenantId: string,
  status: DeliveryStatus,
): Promise<number> {
  const { count } = await service
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", status);
  return count ?? 0;
}

async function countOpenedEmail(
  service: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count } = await service
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .not("opened_at", "is", null);
  return count ?? 0;
}

async function countReadInApp(
  service: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count } = await service
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .not("read_at", "is", null);
  return count ?? 0;
}

function mapDeliveryRow(row: NotificationDeliveryDbRow): NotificationDeliveryRow {
  const status = row.status ?? "queued";
  const channel = row.channel ?? "email";
  const recipientEmail = row.recipient_email ?? "";
  const blockedReason = getRetryBlockedReason({
    status,
    channel,
    recipientEmail,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
  });

  return {
    id: row.id,
    channel,
    type: row.type ?? "onbekend",
    recipientEmail,
    subject: row.subject ?? "",
    status,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    error: row.error,
    relatedType: row.related_type,
    relatedId: row.related_id,
    retryCount: row.retry_count ?? 0,
    lastRetryAt: row.last_retry_at,
    lastRetryError: row.last_retry_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    canRetry: blockedReason === null,
    retryBlockedReason: blockedReason,
  };
}

function getRetryBlockedReason(args: {
  status: DeliveryStatus;
  channel: string;
  recipientEmail: string;
  bodyHtml: string | null;
  bodyText: string | null;
}): string | null {
  if (args.status !== "failed") return "Alleen mislukte notificaties kunnen opnieuw worden geprobeerd.";
  if (args.channel !== "email") return "Alleen e-mailnotificaties kunnen exact opnieuw worden verzonden.";
  if (!args.recipientEmail) return "Deze notificatie heeft geen ontvanger.";
  if (!args.bodyHtml || !args.bodyText) {
    return "Deze oudere logregel mist de bewaarde e-mailinhoud voor een exacte retry.";
  }
  return null;
}

async function markDeliveryStatus(
  service: SupabaseClient,
  id: string,
  tenantId: string,
  args: {
    status: "sent" | "failed" | "skipped";
    provider: string | null;
    providerMessageId: string | null;
    error: string | null;
  },
): Promise<void> {
  const { error } = await service.rpc("mark_notification_status", {
    p_id: id,
    p_tenant_id: tenantId,
    p_status: args.status,
    p_provider: args.provider,
    p_provider_message_id: args.providerMessageId,
    p_error: args.error,
  });
  if (error) throw new Error(`Notificatiestatus bijwerken mislukt: ${error.message}`);
}

async function auditRetry(
  service: SupabaseClient,
  args: { tenantId: string; actorUserId: string; notificationId: string },
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await service.from("audit_log").insert({
    actor_user_id: args.actorUserId,
    tenant_id: args.tenantId,
    action,
    target_type: "notification",
    target_id: args.notificationId,
    payload,
  });
}

function appendOpenTrackingPixel(
  email: { subject: string; html: string; text: string },
  tenantId: string,
  notificationId: string,
): { subject: string; html: string; text: string } {
  const origin = envPublicOrigin();
  if (!origin) return email;
  const src = `${origin}/api/notifications/open/${encodeURIComponent(tenantId)}/${encodeURIComponent(notificationId)}`;
  const pixel = `<img src="${src}" width="1" height="1" alt="" style="display:none!important;opacity:0;width:1px;height:1px;border:0;" />`;
  const html = email.html.includes("</body>")
    ? email.html.replace("</body>", `${pixel}</body>`)
    : `${email.html}${pixel}`;
  return { ...email, html };
}

function envPublicOrigin(): string {
  const override = process.env["NEXT_PUBLIC_APP_URL"];
  if (override) return override.replace(/\/+$/, "");
  const deployed = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (deployed) return `https://${deployed}`;
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return "";
}
