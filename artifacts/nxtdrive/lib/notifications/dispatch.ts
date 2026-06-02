import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmailBranding } from "./branding";
import {
  renderPaymentConfirmation,
  renderPaymentReminder,
  renderLessonReminder,
  renderTaskAssigned,
  renderTrialLessonReceived,
  renderTrialLessonConfirmed,
  renderLessonRefillInvitation,
  renderLessonRefillConfirmed,
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

/**
 * Send an overdue-payment reminder for an open invoice. Idempotent per
 * (invoice, step): the dedupe key includes the step day offset, so each cadence
 * step (e.g. 1/7/14 days after due_date) sends at most once while a later step
 * still fires its own reminder. No-op (returns "not_paid") if the invoice is
 * not open or has no due_date. White-label aware via branding; degrades
 * gracefully (skipped) when the student has no email or email is not
 * configured.
 */
export async function notifyPaymentReminder(
  service: SupabaseClient,
  tenantId: string,
  invoiceId: string,
  stepDays: number,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: invoice } = await service
    .from("invoices")
    .select("id, status, kind, invoice_no, total_cents, due_date, student_id")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (
    !invoice ||
    invoice.status !== "open" ||
    invoice.kind !== "invoice" ||
    !invoice.due_date
  ) {
    return { outcome: "not_paid" };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name, email")
    .eq("id", invoice.student_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const due = new Date(invoice.due_date as string);
  const daysOverdue = Math.max(
    0,
    Math.floor((Date.now() - due.getTime()) / 86_400_000),
  );

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "payment_reminder");
  const email = renderPaymentReminder(
    branding,
    {
      studentName: (student?.full_name as string | undefined) ?? "cursist",
      invoiceNo: invoice.invoice_no as number,
      amountCents: invoice.total_cents as number,
      dueDate: (invoice.due_date as string | null) ?? null,
      daysOverdue,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "payment_reminder",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `payment_reminder:invoice:${invoiceId}:step:${stepDays}`,
    relatedType: "invoice",
    relatedId: invoiceId,
    email,
    fromName: branding.tenantName,
    payload: {
      invoice_no: invoice.invoice_no,
      amount_cents: invoice.total_cents,
      step_days: stepDays,
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

/**
 * Load a trial lesson + its lead (recipient) for a notification. Returns null
 * when the trial does not belong to the tenant. Tenant-scoped throughout.
 */
async function loadTrialForNotify(
  service: SupabaseClient,
  tenantId: string,
  trialId: string,
): Promise<{
  leadEmail: string;
  leadName: string;
  startsAt: string;
  location: string | null;
  instructorId: string | null;
} | null> {
  const { data: trial } = await service
    .from("trial_lessons")
    .select("id, lead_id, instructor_id, starts_at, pickup_location")
    .eq("id", trialId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!trial) return null;

  const { data: lead } = await service
    .from("leads")
    .select("full_name, email")
    .eq("id", trial.lead_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    leadEmail: (lead?.email as string | null) ?? "",
    leadName: (lead?.full_name as string | null) ?? "cursist",
    startsAt: trial.starts_at as string,
    location: (trial.pickup_location as string | null) ?? null,
    instructorId: (trial.instructor_id as string | null) ?? null,
  };
}

/**
 * Acknowledge that a prospect picked a preferred trial-lesson moment (stored
 * provisional). Idempotent per trial-lesson id: each new provisional pick gets a
 * fresh row so re-picking sends a new acknowledgement, but a retried call for
 * the same trial never double-sends. Degrades gracefully (skipped) when the lead
 * has no email or email delivery is not configured.
 */
export async function notifyTrialLessonReceived(
  service: SupabaseClient,
  tenantId: string,
  trialId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const trial = await loadTrialForNotify(service, tenantId, trialId);
  if (!trial) return { outcome: "skipped" };

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "trial_lesson_received");
  const email = renderTrialLessonReceived(
    branding,
    {
      leadName: trial.leadName,
      startsAt: trial.startsAt,
      location: trial.location,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "trial_lesson_received",
    recipientEmail: trial.leadEmail,
    dedupeKey: `trial_lesson_received:trial:${trialId}`,
    relatedType: "trial_lesson",
    relatedId: trialId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: trial.startsAt },
  });
}

/**
 * Confirm a trial lesson to the prospect after the backoffice confirms it.
 * Idempotent per trial-lesson id: confirming twice (or a retried call) never
 * double-sends. Degrades gracefully (skipped) when the lead has no email or
 * email delivery is not configured.
 */
export async function notifyTrialLessonConfirmed(
  service: SupabaseClient,
  tenantId: string,
  trialId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const trial = await loadTrialForNotify(service, tenantId, trialId);
  if (!trial) return { outcome: "skipped" };

  let instructorName: string | null = null;
  if (trial.instructorId) {
    const { data: instructor } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", trial.instructorId)
      .maybeSingle();
    instructorName = (instructor?.full_name as string | null) ?? null;
  }

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "trial_lesson_confirmed");
  const email = renderTrialLessonConfirmed(
    branding,
    {
      leadName: trial.leadName,
      startsAt: trial.startsAt,
      location: trial.location,
      instructorName,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "trial_lesson_confirmed",
    recipientEmail: trial.leadEmail,
    dedupeKey: `trial_lesson_confirmed:trial:${trialId}`,
    relatedType: "trial_lesson",
    relatedId: trialId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: trial.startsAt },
  });
}

/**
 * Load a refill invitation + its student (recipient) for a notification.
 * Returns null when the invitation does not belong to the tenant. Tenant-scoped
 * throughout.
 */
async function loadRefillInvitationForNotify(
  service: SupabaseClient,
  tenantId: string,
  invitationId: string,
): Promise<{
  studentEmail: string;
  studentName: string;
  startsAt: string;
  location: string | null;
  instructorId: string | null;
  expiresAt: string | null;
} | null> {
  const { data: inv } = await service
    .from("lesson_refill_invitations")
    .select(
      "id, student_id, instructor_id, starts_at, location, expires_at",
    )
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!inv) return null;

  const { data: student } = await service
    .from("students")
    .select("full_name, email")
    .eq("id", inv.student_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    studentEmail: (student?.email as string | null) ?? "",
    studentName: (student?.full_name as string | null) ?? "cursist",
    startsAt: inv.starts_at as string,
    location: (inv.location as string | null) ?? null,
    instructorId: (inv.instructor_id as string | null) ?? null,
    expiresAt: (inv.expires_at as string | null) ?? null,
  };
}

async function instructorNameFor(
  service: SupabaseClient,
  instructorId: string | null,
): Promise<string | null> {
  if (!instructorId) return null;
  const { data: instructor } = await service
    .from("profiles")
    .select("full_name")
    .eq("id", instructorId)
    .maybeSingle();
  return (instructor?.full_name as string | null) ?? null;
}

/**
 * Invite a student to a freed lesson moment (wachtlijst). Idempotent per
 * invitation id: re-sending for the same invitation never double-sends.
 * Degrades gracefully (skipped) when the student has no email or email delivery
 * is not configured.
 */
export async function notifyLessonRefillInvitation(
  service: SupabaseClient,
  tenantId: string,
  invitationId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const inv = await loadRefillInvitationForNotify(service, tenantId, invitationId);
  if (!inv) return { outcome: "skipped" };

  const instructorName = await instructorNameFor(service, inv.instructorId);
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "lesson_refill_invitation");
  const email = renderLessonRefillInvitation(
    branding,
    {
      studentName: inv.studentName,
      startsAt: inv.startsAt,
      location: inv.location,
      instructorName,
      expiresAt: inv.expiresAt,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "lesson_refill_invitation",
    recipientEmail: inv.studentEmail,
    dedupeKey: `lesson_refill_invitation:invitation:${invitationId}`,
    relatedType: "lesson_refill_invitation",
    relatedId: invitationId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: inv.startsAt },
  });
}

/**
 * Confirm a booked extra lesson to the student after they accepted the
 * invitation. Idempotent per invitation id: confirming twice (or a retried
 * call) never double-sends. Degrades gracefully (skipped) when the student has
 * no email or email delivery is not configured.
 */
export async function notifyLessonRefillConfirmed(
  service: SupabaseClient,
  tenantId: string,
  invitationId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const inv = await loadRefillInvitationForNotify(service, tenantId, invitationId);
  if (!inv) return { outcome: "skipped" };

  const instructorName = await instructorNameFor(service, inv.instructorId);
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "lesson_refill_confirmed");
  const email = renderLessonRefillConfirmed(
    branding,
    {
      studentName: inv.studentName,
      startsAt: inv.startsAt,
      location: inv.location,
      instructorName,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "lesson_refill_confirmed",
    recipientEmail: inv.studentEmail,
    dedupeKey: `lesson_refill_confirmed:invitation:${invitationId}`,
    relatedType: "lesson_refill_invitation",
    relatedId: invitationId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: inv.startsAt },
  });
}
