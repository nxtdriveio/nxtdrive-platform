import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmailBranding } from "./branding";
import {
  renderPaymentConfirmation,
  renderLessonReminder,
  type LessonReminderData,
} from "./templates";
import { sendEmail } from "./provider";
import type {
  DispatchOutcome,
  NotificationType,
  RenderedEmail,
  TemplateOverride,
} from "./types";

type EnqueueRow = { id: string; status: string; was_created: boolean };

async function loadOverride(
  service: SupabaseClient,
  tenantId: string,
  key: NotificationType,
): Promise<TemplateOverride> {
  const { data } = await service
    .from("notification_templates")
    .select("subject, body_html, body_text, enabled")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .eq("channel", "email")
    .maybeSingle();
  if (!data) return null;
  return {
    subject: (data.subject as string | null) ?? null,
    bodyHtml: (data.body_html as string | null) ?? null,
    bodyText: (data.body_text as string | null) ?? null,
    enabled: Boolean(data.enabled),
  };
}

type DispatchParams = {
  tenantId: string;
  type: NotificationType;
  recipientEmail: string;
  dedupeKey: string;
  relatedType: string | null;
  relatedId: string | null;
  email: RenderedEmail;
  fromName: string;
  payload: Record<string, unknown>;
};

/**
 * Idempotently enqueue + attempt-send a single notification, recording the
 * delivery status. Safe to call repeatedly for the same dedupe_key: once a row
 * is 'sent' it is never re-sent.
 */
async function dispatch(
  service: SupabaseClient,
  params: DispatchParams,
): Promise<{ outcome: DispatchOutcome }> {
  const { data, error } = await service.rpc("enqueue_notification", {
    p_tenant_id: params.tenantId,
    p_channel: "email",
    p_type: params.type,
    p_recipient_email: params.recipientEmail,
    p_subject: params.email.subject,
    p_dedupe_key: params.dedupeKey,
    p_related_type: params.relatedType,
    p_related_id: params.relatedId,
    p_payload: params.payload,
  });
  if (error) {
    console.error("[notifications] enqueue_notification failed", error);
    return { outcome: "enqueue_failed" };
  }
  const row = (data as EnqueueRow[] | null)?.[0];
  if (!row) return { outcome: "enqueue_failed" };
  if (row.status === "sent") return { outcome: "already_sent" };

  if (!params.recipientEmail) {
    await service.rpc("mark_notification_status", {
      p_id: row.id,
      p_tenant_id: params.tenantId,
      p_status: "skipped",
      p_provider: null,
      p_provider_message_id: null,
      p_error: "missing_recipient_email",
    });
    return { outcome: "skipped_no_recipient" };
  }

  const result = await sendEmail({
    to: params.recipientEmail,
    fromName: params.fromName,
    email: params.email,
  });

  if (result.ok) {
    await service.rpc("mark_notification_status", {
      p_id: row.id,
      p_tenant_id: params.tenantId,
      p_status: "sent",
      p_provider: result.provider,
      p_provider_message_id: result.providerMessageId,
      p_error: null,
    });
    return { outcome: "sent" };
  }

  const status: "skipped" | "failed" = result.skipped ? "skipped" : "failed";
  await service.rpc("mark_notification_status", {
    p_id: row.id,
    p_tenant_id: params.tenantId,
    p_status: status,
    p_provider: result.provider,
    p_provider_message_id: null,
    p_error: result.error,
  });
  return { outcome: status };
}

/**
 * Send a payment-confirmation email for an invoice that has just become paid.
 * No-op (returns "not_paid") if the invoice is not actually paid. Idempotent:
 * the dedupe key is the invoice id, so webhook replays never double-send.
 */
export async function notifyInvoicePaid(
  service: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: invoice } = await service
    .from("invoices")
    .select("id, status, invoice_no, total_cents, paid_at, student_id")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice || invoice.status !== "paid") {
    return { outcome: "not_paid" };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name, email")
    .eq("id", invoice.student_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "payment_confirmation");
  const email = renderPaymentConfirmation(
    branding,
    {
      studentName: (student?.full_name as string | undefined) ?? "cursist",
      invoiceNo: invoice.invoice_no as number,
      amountCents: invoice.total_cents as number,
      paidAt: (invoice.paid_at as string | null) ?? null,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "payment_confirmation",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `payment_confirmation:invoice:${invoiceId}`,
    relatedType: "invoice",
    relatedId: invoiceId,
    email,
    fromName: branding.tenantName,
    payload: {
      invoice_no: invoice.invoice_no,
      amount_cents: invoice.total_cents,
    },
  });
}

export type ReminderLesson = {
  id: string;
  starts_at: string;
  location: string | null;
  student_id: string;
  instructorName?: string | null;
};

/**
 * Send a lesson-reminder email. Idempotent: the dedupe key is the lesson id,
 * so repeated cron runs never double-send.
 */
export async function notifyLessonReminder(
  service: SupabaseClient,
  tenantId: string,
  lesson: ReminderLesson,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: student } = await service
    .from("students")
    .select("full_name, email")
    .eq("id", lesson.student_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "lesson_reminder");
  const data: LessonReminderData = {
    studentName: (student?.full_name as string | undefined) ?? "cursist",
    startsAt: lesson.starts_at,
    location: lesson.location ?? null,
    instructorName: lesson.instructorName ?? null,
  };
  const email = renderLessonReminder(branding, data, override);

  return dispatch(service, {
    tenantId,
    type: "lesson_reminder",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `lesson_reminder:lesson:${lesson.id}`,
    relatedType: "lesson",
    relatedId: lesson.id,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: lesson.starts_at },
  });
}
