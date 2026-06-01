import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmailBranding } from "./branding";
import {
  renderPaymentConfirmation,
  renderLessonReminder,
  renderTaskAssigned,
  type LessonReminderData,
} from "./templates";
import { TASK_PRIORITY_LABEL, type TaskPriority } from "@/lib/tasks/types";
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
    const marked = await markStatus(service, row.id, params.tenantId, {
      status: "skipped",
      provider: null,
      providerMessageId: null,
      error: "missing_recipient_email",
    });
    return { outcome: marked ? "skipped_no_recipient" : "status_update_failed" };
  }

  const result = await sendEmail({
    to: params.recipientEmail,
    fromName: params.fromName,
    email: params.email,
  });

  if (result.ok) {
    const marked = await markStatus(service, row.id, params.tenantId, {
      status: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: null,
    });
    // The email WAS sent. If we could not persist 'sent', surface it loudly:
    // the row stays 'queued', so a blind retry would re-send. Operators must
    // reconcile rather than let the system silently double-send.
    if (!marked) {
      console.error(
        "[notifications] email sent but status update failed — row left 'queued', manual reconciliation needed",
        { id: row.id, tenantId: params.tenantId, dedupeKey: params.dedupeKey },
      );
      return { outcome: "status_update_failed" };
    }
    return { outcome: "sent" };
  }

  const status: "skipped" | "failed" = result.skipped ? "skipped" : "failed";
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

/**
 * Wrapper around the mark_notification_status RPC that returns whether the
 * status was actually persisted. Callers MUST act on a false result — a send
 * whose status could not be recorded is an at-risk-of-duplicate state.
 */
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

/**
 * Notify a staff member (instructor/tenant_admin) that a task has been assigned
 * to them. Idempotent per (task, assignee): the dedupe key includes both, so
 * re-saving the same assignment never double-sends, while re-assigning to a
 * different member sends a fresh notification. Degrades gracefully (skipped) if
 * the assignee has no email or email delivery is not configured.
 */
export async function notifyTaskAssigned(
  service: SupabaseClient,
  tenantId: string,
  taskId: string,
  assigneeUserId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: task } = await service
    .from("tasks")
    .select("id, title, board_id, department_id, priority, due_date")
    .eq("id", taskId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!task) return { outcome: "skipped" };

  const [{ data: assignee }, { data: board }, { data: department }] =
    await Promise.all([
      service
        .from("profiles")
        .select("email, full_name")
        .eq("id", assigneeUserId)
        .maybeSingle(),
      task.board_id
        ? service
            .from("task_boards")
            .select("name")
            .eq("id", task.board_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      task.department_id
        ? service
            .from("task_departments")
            .select("name")
            .eq("id", task.department_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "task_assigned");
  const priority = task.priority as TaskPriority | null;
  const email = renderTaskAssigned(
    branding,
    {
      assigneeName: (assignee?.full_name as string | null) ?? "collega",
      taskTitle: (task.title as string | null) ?? "Taak",
      boardName: (board?.name as string | null) ?? null,
      departmentName: (department?.name as string | null) ?? null,
      priorityLabel: priority ? TASK_PRIORITY_LABEL[priority] : null,
      dueDate: (task.due_date as string | null) ?? null,
      taskUrl: null,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "task_assigned",
    recipientEmail: (assignee?.email as string | null) ?? "",
    dedupeKey: `task_assigned:task:${taskId}:${assigneeUserId}`,
    relatedType: "task",
    relatedId: taskId,
    email,
    fromName: branding.tenantName,
    payload: { task_id: taskId, assignee_user_id: assigneeUserId },
  });
}
