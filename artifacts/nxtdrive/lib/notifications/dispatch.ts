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
  renderExamInvitation,
  renderExamConfirmed,
  renderExamPlanned,
  renderExamResultPassed,
  renderExamResultFailed,
  renderIntakeReceived,
  renderLessonCancelled,
  renderLessonRescheduled,
  renderLessonRescheduledInstructor,
  renderInvoiceCreated,
  renderCbrAuthorizationNeeded,
  renderCreditLow,
  renderInstallmentDue,
  renderExamDayReminder,
  renderReviewRequest,
  renderParentInvoiceReady,
  renderParentInvoicePaid,
  renderParentLessonScheduled,
  type LessonReminderData,
} from "./templates";
import {
  loadParentPortalVisibility,
  type ParentPortalSection,
} from "@/lib/parent-portal/visibility";
import {
  getReviewMomentsSettings,
  type ReviewMoment,
} from "./settings";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { TASK_PRIORITY_LABEL, type TaskPriority } from "@/lib/tasks/types";
import { sendEmail } from "./provider";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { dispatchInApp, formatWhenNL } from "./in-app";
import { formatEuro } from "./format";
import { isTenantTriggerEnabled } from "./platform-notification-config";
import type {
  DispatchOutcome,
  InAppContent,
  NotificationType,
  RenderedEmail,
  TemplateOverride,
} from "./types";

type EnqueueRow = { id: string; status: string; was_created: boolean };

/**
 * Template-override ophalen voor een e-mailmelding. Lookup-prioriteit:
 *   1. Tenant white-label override (notification_templates)
 *   2. Platform-standaard uit platform_notification_config
 *   3. Null → hardcode render-functie in templates.ts (bestaand gedrag)
 *
 * Beide tabellen worden parallel geladen (één round-trip).
 */
async function loadOverride(
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

  const td = tenantRow.data;
  const pd = platformRow.data;

  // Geen tenant-override én geen platform-content → terugvallen op code-fallback
  if (!td && !pd?.body_html && !pd?.subject) return null;

  return {
    subject: (td?.subject as string | null) ?? (pd?.subject as string | null) ?? null,
    bodyHtml: (td?.body_html as string | null) ?? (pd?.body_html as string | null) ?? null,
    bodyText: (td?.body_text as string | null) ?? (pd?.body_text as string | null) ?? null,
    // Tenant-enabled vlag is apart geregeld via het gate-mechanisme; hier altijd true
    enabled: td ? Boolean(td.enabled) : true,
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
  /**
   * Optional in-app copy of this notification. When present with a non-null
   * recipientUserId, an in-app message is enqueued (idempotently) for that user
   * in addition to the email. Leave undefined / null for lead-targeted events
   * where the recipient has no account.
   */
  inApp?: InAppContent | null;
};

/**
 * Idempotently enqueue + attempt-send a single notification, recording the
 * delivery status. Safe to call repeatedly for the same dedupe_key: once a row
 * is 'sent' it is never re-sent.
 *
 * The in-app channel (when params.inApp is provided) is dispatched first and is
 * fully independent of the email outcome: it is idempotent per (tenant, dedupe
 * key) on its own table, never throws, and degrades to a no-op when there is no
 * recipient user. So a retried call re-asserts the in-app message without
 * double-notifying, even if the email was already sent.
 */
async function dispatch(
  service: SupabaseClient,
  params: DispatchParams,
): Promise<{ outcome: DispatchOutcome }> {
  // In-app en push zijn kanaal-specifieke leveringen die onafhankelijk van
  // e-mail worden bepaald. dispatchInApp heeft z'n eigen "inapp"-gate +
  // afzonderlijke "push"-gate voor het web-push-gedeelte.
  // Eerst dispatchen zodat een uitgeschakelde e-mailtrigger de in-app/push
  // NIET onderdrukt.
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

  // E-mail-kanaalgate: controleert global + tenant_enabled uitsluitend voor
  // het e-mailkanaal. In-app/push zijn al afgehandeld en worden niet geraakt.
  const emailEnabled = await isTenantTriggerEnabled(service, params.tenantId, params.type, "email").catch(() => true);
  if (!emailEnabled) return { outcome: "skipped" };

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

  const platformConfig = await getPlatformEmailConfig(service).catch(() => null);
  const result = await sendEmail({
    to: params.recipientEmail,
    fromName: params.fromName,
    email: params.email,
    platformConfig: platformConfig ?? undefined,
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
    .select("full_name, email, user_id")
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
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Betaling ontvangen",
      body: `Je betaling voor factuur #${invoice.invoice_no} is verwerkt.`,
      link: "/student/facturen",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        invoice_no: String(invoice.invoice_no),
        amount: formatEuro(invoice.total_cents as number),
      },
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
    .select("full_name, email, user_id")
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
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Betalingsherinnering",
      body: `Factuur #${invoice.invoice_no} staat nog open.`,
      link: "/student/facturen",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        invoice_no: String(invoice.invoice_no),
        amount: formatEuro(invoice.total_cents as number),
      },
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
    .select("full_name, email, user_id")
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
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Herinnering: rijles",
      body: `Je rijles staat gepland op ${formatWhenNL(lesson.starts_at)}.`,
      link: "/student/lessons",
      vars: {
        tenant_name: branding.tenantName,
        student_name: data.studentName,
        lesson_time: formatWhenNL(lesson.starts_at),
        location: lesson.location ?? "",
        instructor_name: lesson.instructorName ?? "",
      },
    },
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
    inApp: {
      recipientUserId: assigneeUserId,
      title: "Nieuwe taak toegewezen",
      body: (task.title as string | null) ?? "Er is een taak aan je toegewezen.",
      link: "/backoffice/taken",
      vars: {
        tenant_name: branding.tenantName,
        assignee_name: (assignee?.full_name as string | undefined) ?? "collega",
        task_title: (task.title as string | undefined) ?? "Taak",
        board_name: (board?.name as string | undefined) ?? "",
        department_name: (department?.name as string | undefined) ?? "",
        priority: priority ? TASK_PRIORITY_LABEL[priority] : "",
      },
    },
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
  studentUserId: string | null;
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
    .select("full_name, email, user_id")
    .eq("id", inv.student_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    studentEmail: (student?.email as string | null) ?? "",
    studentName: (student?.full_name as string | null) ?? "cursist",
    studentUserId: (student?.user_id as string | null) ?? null,
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
    inApp: {
      recipientUserId: inv.studentUserId,
      title: "Vrijgekomen lesmoment",
      body: `Er is een rijles vrij op ${formatWhenNL(inv.startsAt)}. Reageer snel.`,
      link: "/student/lessons",
      vars: {
        tenant_name: branding.tenantName,
        student_name: inv.studentName,
        lesson_time: formatWhenNL(inv.startsAt),
        location: inv.location ?? "",
        instructor_name: instructorName ?? "",
      },
    },
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
    inApp: {
      recipientUserId: inv.studentUserId,
      title: "Extra les bevestigd",
      body: `Je extra rijles op ${formatWhenNL(inv.startsAt)} is bevestigd.`,
      link: "/student/lessons",
      vars: {
        tenant_name: branding.tenantName,
        student_name: inv.studentName,
        lesson_time: formatWhenNL(inv.startsAt),
        location: inv.location ?? "",
        instructor_name: instructorName ?? "",
      },
    },
  });
}

/**
 * Load an exam invitation + its student (recipient) and the exam moment for a
 * notification. Returns null when the invitation does not belong to the tenant.
 * Tenant-scoped throughout.
 */
async function loadExamInvitationForNotify(
  service: SupabaseClient,
  tenantId: string,
  invitationId: string,
): Promise<{
  studentEmail: string;
  studentName: string;
  studentUserId: string | null;
  examType: "exam" | "interim_test";
  startsAt: string;
  location: string | null;
  instructorId: string | null;
  expiresAt: string | null;
} | null> {
  const { data: inv } = await service
    .from("exam_invitations")
    .select("id, student_id, appointment_id, expires_at")
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!inv) return null;

  const { data: appt } = await service
    .from("agenda_appointments")
    .select("type, starts_at, location, instructor_id")
    .eq("id", inv.appointment_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!appt) return null;

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", inv.student_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    studentEmail: (student?.email as string | null) ?? "",
    studentName: (student?.full_name as string | null) ?? "cursist",
    studentUserId: (student?.user_id as string | null) ?? null,
    examType: appt.type as "exam" | "interim_test",
    startsAt: appt.starts_at as string,
    location: (appt.location as string | null) ?? null,
    instructorId: (appt.instructor_id as string | null) ?? null,
    expiresAt: (inv.expires_at as string | null) ?? null,
  };
}

/**
 * Invite a student to an open exam moment. Idempotent per invitation id:
 * re-sending for the same invitation never double-sends. Degrades gracefully
 * (skipped) when the student has no email or email delivery is not configured.
 */
export async function notifyExamInvitation(
  service: SupabaseClient,
  tenantId: string,
  invitationId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const inv = await loadExamInvitationForNotify(service, tenantId, invitationId);
  if (!inv) return { outcome: "skipped" };

  const instructorName = await instructorNameFor(service, inv.instructorId);
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "exam_invitation");
  const email = renderExamInvitation(
    branding,
    {
      studentName: inv.studentName,
      examType: inv.examType,
      startsAt: inv.startsAt,
      location: inv.location,
      instructorName,
      expiresAt: inv.expiresAt,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "exam_invitation",
    recipientEmail: inv.studentEmail,
    dedupeKey: `exam_invitation:invitation:${invitationId}`,
    relatedType: "exam_invitation",
    relatedId: invitationId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: inv.startsAt, exam_type: inv.examType },
    inApp: {
      recipientUserId: inv.studentUserId,
      title: `${inv.examType === "exam" ? "Examen" : "Tussentijdse toets"} aangeboden`,
      body: `Er is een ${inv.examType === "exam" ? "examen" : "tussentijdse toets"} beschikbaar op ${formatWhenNL(inv.startsAt)}.`,
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: inv.studentName,
        exam_type: inv.examType === "exam" ? "examen" : "tussentijdse toets",
        exam_time: formatWhenNL(inv.startsAt),
        location: inv.location ?? "",
        instructor_name: instructorName ?? "",
      },
    },
  });
}

/**
 * Confirm a booked exam moment to the student after they accepted the
 * invitation. Idempotent per invitation id: confirming twice (or a retried
 * call) never double-sends. Degrades gracefully (skipped) when the student has
 * no email or email delivery is not configured.
 */
export async function notifyExamConfirmed(
  service: SupabaseClient,
  tenantId: string,
  invitationId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const inv = await loadExamInvitationForNotify(service, tenantId, invitationId);
  if (!inv) return { outcome: "skipped" };

  const instructorName = await instructorNameFor(service, inv.instructorId);
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "exam_confirmed");
  const email = renderExamConfirmed(
    branding,
    {
      studentName: inv.studentName,
      examType: inv.examType,
      startsAt: inv.startsAt,
      location: inv.location,
      instructorName,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "exam_confirmed",
    recipientEmail: inv.studentEmail,
    dedupeKey: `exam_confirmed:invitation:${invitationId}`,
    relatedType: "exam_invitation",
    relatedId: invitationId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: inv.startsAt, exam_type: inv.examType },
    inApp: {
      recipientUserId: inv.studentUserId,
      title: `${inv.examType === "exam" ? "Examen" : "Tussentijdse toets"} bevestigd`,
      body: `Je ${inv.examType === "exam" ? "examen" : "tussentijdse toets"} op ${formatWhenNL(inv.startsAt)} is bevestigd.`,
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: inv.studentName,
        exam_type: inv.examType === "exam" ? "examen" : "tussentijdse toets",
        exam_time: formatWhenNL(inv.startsAt),
        location: inv.location ?? "",
        instructor_name: instructorName ?? "",
      },
    },
  });
}

/**
 * Confirm to the student that an exam moment has been planned for them (the
 * appointment carries their student_id). Idempotent per appointment id: planning
 * twice (or a retried action / a later edit) never double-sends — the dedupe key
 * is the appointment, not the edit. Degrades gracefully (skipped) when the
 * student has no email or email delivery is not configured. Only exam /
 * interim_test appointments with a linked student qualify; anything else returns
 * 'skipped' without enqueueing.
 */
export async function notifyExamPlanned(
  service: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: appt } = await service
    .from("agenda_appointments")
    .select("type, status, starts_at, location, instructor_id, student_id")
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!appt) return { outcome: "skipped" };

  const type = appt.type as string;
  if (type !== "exam" && type !== "interim_test") return { outcome: "skipped" };
  if (appt.status !== "planned") return { outcome: "skipped" };
  const studentId = appt.student_id as string | null;
  if (!studentId) return { outcome: "skipped" };

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const instructorName = await instructorNameFor(
    service,
    (appt.instructor_id as string | null) ?? null,
  );
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "exam_planned");
  const email = renderExamPlanned(
    branding,
    {
      studentName: (student?.full_name as string | null) ?? "cursist",
      examType: type as "exam" | "interim_test",
      startsAt: appt.starts_at as string,
      location: (appt.location as string | null) ?? null,
      instructorName,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "exam_planned",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `exam_planned:appointment:${appointmentId}`,
    relatedType: "agenda_appointment",
    relatedId: appointmentId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: appt.starts_at, exam_type: type },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: `${type === "exam" ? "Examen" : "Tussentijdse toets"} ingepland`,
      body: `Er is een ${type === "exam" ? "examen" : "tussentijdse toets"} voor je ingepland op ${formatWhenNL(appt.starts_at as string)}.`,
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        exam_type: type === "exam" ? "examen" : "tussentijdse toets",
        exam_time: formatWhenNL(appt.starts_at as string),
        location: (appt.location as string | null) ?? "",
        instructor_name: instructorName ?? "",
      },
    },
  });
}

/**
 * Examenflow C — uitslag-mail na een afgerond examen/TTT. Stuurt een
 * felicitatie (geslaagd) of een empathisch bericht (gezakt). Idempotent per
 * (afspraak, uitslag): de dedupe key bevat de uitslag, zodat een correctie van
 * geslaagd↔gezakt elk nog precies één mail oplevert. Degradeert naar 'skipped'
 * bij geen leerling/e-mail of een uitslag zonder eigen mail (no_show).
 */
export async function notifyExamResult(
  service: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: appt } = await service
    .from("agenda_appointments")
    .select("type, status, result, student_id")
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!appt) return { outcome: "skipped" };

  const type = appt.type as string;
  if (type !== "exam" && type !== "interim_test") return { outcome: "skipped" };
  if (appt.status !== "completed") return { outcome: "skipped" };
  const result = appt.result as string | null;
  if (result !== "passed" && result !== "failed") return { outcome: "skipped" };
  const studentId = appt.student_id as string | null;
  if (!studentId) return { outcome: "skipped" };

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const branding = await loadEmailBranding(service, tenantId);
  const notifType = result === "passed" ? "exam_passed" : "exam_failed";
  const override = await loadOverride(service, tenantId, notifType);
  const renderData = {
    studentName: (student?.full_name as string | null) ?? "cursist",
    examType: type as "exam" | "interim_test",
  };
  const email =
    result === "passed"
      ? renderExamResultPassed(branding, renderData, override)
      : renderExamResultFailed(branding, renderData, override);

  return dispatch(service, {
    tenantId,
    type: notifType,
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `exam_result:appointment:${appointmentId}:${result}`,
    relatedType: "agenda_appointment",
    relatedId: appointmentId,
    email,
    fromName: branding.tenantName,
    payload: { exam_type: type, result },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: result === "passed" ? "Gefeliciteerd, geslaagd!" : "Examenuitslag",
      body:
        result === "passed"
          ? `Je bent geslaagd voor je ${type === "exam" ? "examen" : "tussentijdse toets"}.`
          : `Helaas, je ${type === "exam" ? "examen" : "tussentijdse toets"} is niet gehaald. We plannen samen de volgende stap.`,
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        exam_type: type === "exam" ? "examen" : "tussentijdse toets",
        result: result === "passed" ? "geslaagd" : "gezakt",
      },
    },
  });
}

/**
 * Task #107 — bevestig aan een nieuwe prospect dat hun intake-aanvraag is
 * ontvangen. Idempotent per lead id: een herhaalde aanroep stuurt nooit dubbel.
 * Degradeert naar 'skipped' wanneer de lead geen e-mail heeft of e-mail nog niet
 * is gekoppeld.
 */
export async function notifyIntakeReceived(
  service: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: lead } = await service
    .from("leads")
    .select("full_name, email")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!lead) return { outcome: "skipped" };

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "intake_received");
  const email = renderIntakeReceived(
    branding,
    { leadName: (lead.full_name as string | null) ?? "cursist" },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "intake_received",
    recipientEmail: (lead.email as string | null) ?? "",
    dedupeKey: `intake_received:lead:${leadId}`,
    relatedType: "lead",
    relatedId: leadId,
    email,
    fromName: branding.tenantName,
    payload: {},
  });
}

/**
 * Task #107 — meld de leerling dat een geplande rijles is geannuleerd, inclusief
 * of het lestegoed is teruggestort. Idempotent per les id. No-op (skipped) als de
 * les niet bestaat of (nog) niet geannuleerd is, of de leerling geen e-mail heeft.
 */
export async function notifyLessonCancelled(
  service: SupabaseClient,
  tenantId: string,
  lessonId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: lesson } = await service
    .from("lessons")
    .select("id, status, starts_at, location, student_id, instructor_id")
    .eq("id", lessonId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!lesson) return { outcome: "skipped" };

  const status = lesson.status as string;
  if (status !== "cancelled_with_refund" && status !== "cancelled_no_refund") {
    return { outcome: "skipped" };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", lesson.student_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const instructorName = await instructorNameFor(
    service,
    (lesson.instructor_id as string | null) ?? null,
  );
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "lesson_cancelled");
  const email = renderLessonCancelled(
    branding,
    {
      studentName: (student?.full_name as string | null) ?? "cursist",
      startsAt: lesson.starts_at as string,
      location: (lesson.location as string | null) ?? null,
      instructorName,
      refunded: status === "cancelled_with_refund",
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "lesson_cancelled",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `lesson_cancelled:lesson:${lessonId}`,
    relatedType: "lesson",
    relatedId: lessonId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: lesson.starts_at, status },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Rijles geannuleerd",
      body: `Je rijles van ${formatWhenNL(lesson.starts_at as string)} is geannuleerd${
        status === "cancelled_with_refund"
          ? " — je tegoed is teruggestort"
          : ""
      }.`,
      link: "/student/lessons",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        lesson_time: formatWhenNL(lesson.starts_at as string),
        location: (lesson.location as string | null) ?? "",
        instructor_name: instructorName ?? "",
        refunded: status === "cancelled_with_refund" ? "ja" : "nee",
      },
    },
  });
}

export type LessonRescheduledSummary = {
  student: DispatchOutcome | "skipped";
  instructor: DispatchOutcome | "skipped";
  guardians: DispatchOutcome[];
};

/**
 * Task #181 — meld een verzette geplande rijles. Wanneer een leerling/voogd een
 * eigen geplande les via self-service naar een nieuw moment verplaatst
 * (student_reschedule_lesson, 0085) wordt niemand vanzelf geïnformeerd. Deze
 * orchestrator stuurt:
 *   - een bevestiging (e-mail + in-app) naar de leerling;
 *   - dezelfde bevestiging naar elke gekoppelde voogd (fan-out), maar alleen als
 *     de rijschool de parent-portal sectie 'planning' zichtbaar laat (consistent
 *     met de overige ouder-meldingen);
 *   - een melding (e-mail + in-app) naar de toegewezen instructeur, zodat zijn
 *     agenda klopt.
 *
 * De OUDE starttijd is na de RPC-update verloren, dus die wordt door de actie
 * meegegeven (`previousStartsAt`); de NIEUWE tijd wordt uit de les-rij gelezen
 * (single source of truth). Exact-één-keer per verzetting: de dedupe key bevat
 * zowel de oude als de nieuwe starttijd, zodat een herhaalde dispatch nooit
 * dubbel stuurt en een vólgende verzetting opnieuw precies één melding oplevert.
 */
export async function notifyLessonRescheduled(
  service: SupabaseClient,
  tenantId: string,
  lessonId: string,
  previousStartsAt: string,
): Promise<LessonRescheduledSummary> {
  const summary: LessonRescheduledSummary = {
    student: "skipped",
    instructor: "skipped",
    guardians: [],
  };

  const { data: lesson } = await service
    .from("lessons")
    .select("id, status, starts_at, location, student_id, instructor_id")
    .eq("id", lessonId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!lesson || lesson.status !== "planned") return summary;

  const newStartsAt = lesson.starts_at as string;
  const location = (lesson.location as string | null) ?? null;
  const studentId = lesson.student_id as string;
  const instructorId = (lesson.instructor_id as string | null) ?? null;

  // Stable, reschedule-specific suffix: a repeated dispatch for the SAME move is
  // suppressed; a later move (different new time) re-arms a fresh notification.
  const moveKey = `${previousStartsAt}->${newStartsAt}`;

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const studentName = (student?.full_name as string | null) ?? "cursist";

  const instructorName = await instructorNameFor(service, instructorId);
  const branding = await loadEmailBranding(service, tenantId);

  // --- 1. Confirmation to the student ------------------------------------
  {
    const override = await loadOverride(service, tenantId, "lesson_rescheduled");
    const email = renderLessonRescheduled(
      branding,
      {
        studentName,
        previousStartsAt,
        newStartsAt,
        location,
        instructorName,
      },
      override,
    );
    const { outcome } = await dispatch(service, {
      tenantId,
      type: "lesson_rescheduled",
      recipientEmail: (student?.email as string | null) ?? "",
      dedupeKey: `lesson_rescheduled:lesson:${lessonId}:${moveKey}`,
      relatedType: "lesson",
      relatedId: lessonId,
      email,
      fromName: branding.tenantName,
      payload: { previous_starts_at: previousStartsAt, starts_at: newStartsAt },
      inApp: {
        recipientUserId: (student?.user_id as string | null) ?? null,
        title: "Rijles verzet",
        body: `Je rijles is verzet naar ${formatWhenNL(newStartsAt)}.`,
        link: "/student/lessons",
        vars: {
          tenant_name: branding.tenantName,
          student_name: studentName,
          lesson_time: formatWhenNL(newStartsAt),
          previous_lesson_time: formatWhenNL(previousStartsAt),
          location: location ?? "",
          instructor_name: instructorName ?? "",
        },
      },
    });
    summary.student = outcome;
  }

  // --- 2. Confirmation to every linked guardian (planning-gated) ---------
  if (await parentSectionVisible(service, tenantId, "planning")) {
    const guardians = await loadGuardiansForStudent(service, tenantId, studentId);
    const override = await loadOverride(service, tenantId, "lesson_rescheduled");
    for (const guardian of guardians) {
      const email = renderLessonRescheduled(
        branding,
        {
          studentName,
          previousStartsAt,
          newStartsAt,
          location,
          instructorName,
        },
        override,
      );
      const { outcome } = await dispatch(service, {
        tenantId,
        type: "lesson_rescheduled",
        recipientEmail: guardian.email,
        dedupeKey: `lesson_rescheduled:lesson:${lessonId}:${moveKey}:guardian:${guardian.userId}`,
        relatedType: "lesson",
        relatedId: lessonId,
        email,
        fromName: branding.tenantName,
        payload: {
          previous_starts_at: previousStartsAt,
          starts_at: newStartsAt,
          student_id: studentId,
        },
        inApp: {
          recipientUserId: guardian.userId,
          title: "Rijles verzet",
          body: `De rijles van ${studentName} is verzet naar ${formatWhenNL(newStartsAt)}.`,
          link: "/ouder",
          vars: {
            tenant_name: branding.tenantName,
            student_name: studentName,
            lesson_time: formatWhenNL(newStartsAt),
            previous_lesson_time: formatWhenNL(previousStartsAt),
            location: location ?? "",
            instructor_name: instructorName ?? "",
          },
        },
      });
      summary.guardians.push(outcome);
    }
  }

  // --- 3. Notify the assigned instructor ---------------------------------
  if (instructorId) {
    const { data: instructor } = await service
      .from("profiles")
      .select("email, full_name")
      .eq("id", instructorId)
      .maybeSingle();
    const override = await loadOverride(
      service,
      tenantId,
      "lesson_rescheduled_instructor",
    );
    const email = renderLessonRescheduledInstructor(
      branding,
      {
        instructorName: (instructor?.full_name as string | null) ?? instructorName,
        studentName,
        previousStartsAt,
        newStartsAt,
        location,
      },
      override,
    );
    const { outcome } = await dispatch(service, {
      tenantId,
      type: "lesson_rescheduled_instructor",
      recipientEmail: (instructor?.email as string | null) ?? "",
      dedupeKey: `lesson_rescheduled_instructor:lesson:${lessonId}:${moveKey}`,
      relatedType: "lesson",
      relatedId: lessonId,
      email,
      fromName: branding.tenantName,
      payload: { previous_starts_at: previousStartsAt, starts_at: newStartsAt },
      inApp: {
        recipientUserId: instructorId,
        title: "Rijles verzet",
        body: `${studentName} heeft een rijles verzet naar ${formatWhenNL(newStartsAt)}.`,
        link: "/instructor/week",
        vars: {
          tenant_name: branding.tenantName,
          instructor_name: (instructor?.full_name as string | null) ?? instructorName ?? "",
          student_name: studentName,
          lesson_time: formatWhenNL(newStartsAt),
          previous_lesson_time: formatWhenNL(previousStartsAt),
          location: location ?? "",
        },
      },
    });
    summary.instructor = outcome;
  }

  return summary;
}

/**
 * Task #107 — meld de leerling dat een nieuwe (geopende) factuur klaarstaat.
 * Idempotent per factuur id. No-op (skipped) als de factuur niet open is, een
 * creditnota is, of onderdeel is van een termijnschema (die loopt via
 * installment_due, zodat het openen van een plan niet N mails ineens oplevert).
 */
export async function notifyInvoiceCreated(
  service: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: invoice } = await service
    .from("invoices")
    .select(
      "id, status, kind, invoice_no, total_cents, due_date, student_id, installment_plan_id",
    )
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (
    !invoice ||
    invoice.status !== "open" ||
    invoice.kind !== "invoice" ||
    invoice.installment_plan_id !== null
  ) {
    return { outcome: "skipped" };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", invoice.student_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "invoice_created");
  const email = renderInvoiceCreated(
    branding,
    {
      studentName: (student?.full_name as string | null) ?? "cursist",
      invoiceNo: invoice.invoice_no as number,
      amountCents: invoice.total_cents as number,
      dueDate: (invoice.due_date as string | null) ?? null,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "invoice_created",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `invoice_created:invoice:${invoiceId}`,
    relatedType: "invoice",
    relatedId: invoiceId,
    email,
    fromName: branding.tenantName,
    payload: {
      invoice_no: invoice.invoice_no,
      amount_cents: invoice.total_cents,
    },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Nieuwe factuur",
      body: `Factuur #${invoice.invoice_no} staat voor je klaar.`,
      link: "/student/facturen",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        invoice_no: String(invoice.invoice_no),
        amount: formatEuro(invoice.total_cents as number),
      },
    },
  });
}

/**
 * Task #107 — vraag de leerling om de CBR-machtiging te regelen. Idempotent per
 * leerling id: herhaalde 'nog_nodig'-opslag stuurt nooit dubbel. Bekende
 * trade-off: de dedupe key is stabiel per leerling, dus na een latere
 * status-wisseling (ontvangen → opnieuw nog_nodig) wordt niet nogmaals gemaild.
 */
export async function notifyCbrAuthorizationNeeded(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!student) return { outcome: "skipped" };

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(
    service,
    tenantId,
    "cbr_authorization_needed",
  );
  const email = renderCbrAuthorizationNeeded(
    branding,
    { studentName: (student.full_name as string | null) ?? "cursist" },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "cbr_authorization_needed",
    recipientEmail: (student.email as string | null) ?? "",
    dedupeKey: `cbr_authorization_needed:student:${studentId}`,
    relatedType: "student",
    relatedId: studentId,
    email,
    fromName: branding.tenantName,
    payload: {},
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "CBR-machtiging nodig",
      body: "Regel je CBR-machtiging zodat we je examen kunnen aanvragen.",
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student.full_name as string | null) ?? "cursist",
      },
    },
  });
}

/**
 * Task #107 — attendeer de leerling dat hun lestegoed onder de drempel is gezakt.
 * Idempotent per (leerling, top-up-epoch): de dedupe key bevat het aantal
 * positieve ledger-mutaties (bijbestellingen), zodat na een nieuwe aankoop een
 * volgende keer 'bijna op' opnieuw precies één mail oplevert (re-arm zonder
 * extra state). De cron levert balans + epoch aan.
 */
export async function notifyCreditLow(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
  balanceMinutes: number,
  topupEpoch: number,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!student) return { outcome: "skipped" };

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "credit_low");
  const email = renderCreditLow(
    branding,
    {
      studentName: (student.full_name as string | null) ?? "cursist",
      balanceMinutes,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "credit_low",
    recipientEmail: (student.email as string | null) ?? "",
    dedupeKey: `credit_low:student:${studentId}:topups:${topupEpoch}`,
    relatedType: "student",
    relatedId: studentId,
    email,
    fromName: branding.tenantName,
    payload: { balance_minutes: balanceMinutes, topup_epoch: topupEpoch },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Lestegoed bijna op",
      body: `Je hebt nog ${balanceMinutes} minuten lestegoed.`,
      link: "/student/credits",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student.full_name as string | null) ?? "cursist",
        balance_minutes: String(balanceMinutes),
      },
    },
  });
}

/**
 * Task #107 — herinner de leerling dat een termijnfactuur bijna vervalt.
 * Idempotent per factuur id. No-op (skipped) als de factuur niet open is, geen
 * termijn betreft, of de leerling geen e-mail heeft. Overdue-herinneringen
 * blijven via notifyPaymentReminder lopen; dit is de heads-up rond de vervaldatum.
 */
export async function notifyInstallmentDue(
  service: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: invoice } = await service
    .from("invoices")
    .select(
      "id, status, kind, invoice_no, total_cents, due_date, student_id, installment_plan_id, installment_no, installment_count",
    )
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (
    !invoice ||
    invoice.status !== "open" ||
    invoice.kind !== "invoice" ||
    invoice.installment_plan_id === null
  ) {
    return { outcome: "skipped" };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", invoice.student_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "installment_due");
  const email = renderInstallmentDue(
    branding,
    {
      studentName: (student?.full_name as string | null) ?? "cursist",
      invoiceNo: invoice.invoice_no as number,
      amountCents: invoice.total_cents as number,
      dueDate: (invoice.due_date as string | null) ?? null,
      installmentNo: (invoice.installment_no as number | null) ?? null,
      installmentCount: (invoice.installment_count as number | null) ?? null,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "installment_due",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `installment_due:invoice:${invoiceId}`,
    relatedType: "invoice",
    relatedId: invoiceId,
    email,
    fromName: branding.tenantName,
    payload: {
      invoice_no: invoice.invoice_no,
      amount_cents: invoice.total_cents,
      installment_no: invoice.installment_no,
    },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Termijn vervalt binnenkort",
      body: `Termijnfactuur #${invoice.invoice_no} vervalt binnenkort.`,
      link: "/student/facturen",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        invoice_no: String(invoice.invoice_no),
        amount: formatEuro(invoice.total_cents as number),
        installment_no: String((invoice.installment_no as number | null) ?? ""),
        installment_count: String((invoice.installment_count as number | null) ?? ""),
      },
    },
  });
}

/**
 * Task #107 — herinner de leerling kort voor hun examen/TTT aan het moment.
 * Idempotent per afspraak id. Alleen exam/interim_test-afspraken met status
 * 'planned' en een gekoppelde leerling komen in aanmerking; anders 'skipped'.
 */
export async function notifyExamDayReminder(
  service: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const { data: appt } = await service
    .from("agenda_appointments")
    .select("type, status, starts_at, location, instructor_id, student_id")
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!appt) return { outcome: "skipped" };

  const type = appt.type as string;
  if (type !== "exam" && type !== "interim_test") return { outcome: "skipped" };
  if (appt.status !== "planned") return { outcome: "skipped" };
  const studentId = appt.student_id as string | null;
  if (!studentId) return { outcome: "skipped" };

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const instructorName = await instructorNameFor(
    service,
    (appt.instructor_id as string | null) ?? null,
  );
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "exam_day_reminder");
  const email = renderExamDayReminder(
    branding,
    {
      studentName: (student?.full_name as string | null) ?? "cursist",
      examType: type as "exam" | "interim_test",
      startsAt: appt.starts_at as string,
      location: (appt.location as string | null) ?? null,
      instructorName,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "exam_day_reminder",
    recipientEmail: (student?.email as string | null) ?? "",
    dedupeKey: `exam_day_reminder:appointment:${appointmentId}`,
    relatedType: "agenda_appointment",
    relatedId: appointmentId,
    email,
    fromName: branding.tenantName,
    payload: { starts_at: appt.starts_at, exam_type: type },
    inApp: {
      recipientUserId: (student?.user_id as string | null) ?? null,
      title: "Herinnering: examen",
      body: `Je ${type === "exam" ? "examen" : "tussentijdse toets"} is op ${formatWhenNL(appt.starts_at as string)}. Succes!`,
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student?.full_name as string | undefined) ?? "cursist",
        exam_type: type === "exam" ? "examen" : "tussentijdse toets",
        exam_time: formatWhenNL(appt.starts_at as string),
        location: (appt.location as string | null) ?? "",
        instructor_name: instructorName ?? "",
      },
    },
  });
}

// ===========================================================================
// Task #113 — Review- & referralflow. Geautomatiseerde, idempotente
// reviewverzoeken op de juiste momenten in het traject. Elk moment is
// tenant-configureerbaar (getReviewMomentsSettings); een inactief moment is een
// no-op. De CTA wijst naar de tenant-Google-review-URL of valt terug op de app.
// Idempotent per (leerling/lead, moment) via de dedupe key — een herhaalde
// trigger stuurt nooit dubbel.
// ===========================================================================

/** Env-only publieke origin (geen request headers — veilig vanuit cron/sweep). */
function envPublicOrigin(): string {
  const override = process.env["NEXT_PUBLIC_APP_URL"];
  if (override) return override.replace(/\/+$/, "");
  const deployed = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (deployed) return `https://${deployed}`;
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return "";
}

/**
 * Stuur een reviewverzoek naar een LEERLING voor een specifiek moment. Checkt
 * eerst of het moment voor deze tenant actief is. Idempotent per (leerling,
 * moment); voor exam_passed bevat de dedupe key ook de afspraak, zodat elk
 * geslaagd examen precies één verzoek oplevert. Degradeert naar 'skipped' bij
 * een inactief moment of ontbrekende leerling.
 */
export async function notifyStudentReviewRequest(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
  moment: ReviewMoment,
  opts?: { appointmentId?: string },
): Promise<{ outcome: DispatchOutcome }> {
  const settings = await getReviewMomentsSettings(service, tenantId);
  if (!settings.activeMoments[moment]) return { outcome: "skipped" };

  const { data: student } = await service
    .from("students")
    .select("full_name, email, user_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!student) return { outcome: "skipped" };

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "review_request");
  const origin = envPublicOrigin();
  const reviewUrl =
    settings.googleReviewUrl ?? (origin ? `${origin}/student` : "/student");
  const email = renderReviewRequest(
    branding,
    {
      studentName: (student.full_name as string | null) ?? "cursist",
      moment,
      reviewUrl,
    },
    override,
  );

  const suffix =
    moment === "exam_passed" && opts?.appointmentId
      ? `:${opts.appointmentId}`
      : "";

  return dispatch(service, {
    tenantId,
    type: "review_request",
    recipientEmail: (student.email as string | null) ?? "",
    dedupeKey: `review_request:student:${studentId}:${moment}${suffix}`,
    relatedType: "student",
    relatedId: studentId,
    email,
    fromName: branding.tenantName,
    payload: { moment },
    inApp: {
      recipientUserId: (student.user_id as string | null) ?? null,
      title: "Deel je ervaring",
      body: "Zou je een momentje willen nemen om een review achter te laten? Het helpt ons enorm!",
      link: "/student",
      vars: {
        tenant_name: branding.tenantName,
        student_name: (student.full_name as string | null) ?? "cursist",
        review_url: reviewUrl,
        moment,
      },
    },
  });
}

/**
 * Vuur — na het vastleggen van een examenuitslag — het exam_passed-reviewmoment
 * af. Alleen voor een GESLAAGD echt rijexamen (geen tussentijdse toets). Loadt de
 * afspraak, controleert type/uitslag en delegeert naar de leerling-notify met de
 * afspraak in de dedupe key. Best-effort; faalt nooit de aanroepende actie.
 */
export async function maybeFireExamPassedReview(
  service: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  try {
    const { data: appt } = await service
      .from("agenda_appointments")
      .select("type, status, result, student_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!appt) return;
    if (appt.type !== "exam") return;
    if (appt.status !== "completed" || appt.result !== "passed") return;
    const studentId = appt.student_id as string | null;
    if (!studentId) return;
    await notifyStudentReviewRequest(service, tenantId, studentId, "exam_passed", {
      appointmentId,
    });
  } catch (err) {
    console.error("[notifications] maybeFireExamPassedReview failed", {
      tenantId,
      appointmentId,
      err,
    });
  }
}

/**
 * Stuur een reviewverzoek (na proefles) naar een LEAD. Leads hebben geen
 * account, dus alleen e-mail — geen in-app. Idempotent per lead. No-op als het
 * after_trial-moment voor deze tenant uit staat of de lead geen e-mail heeft.
 */
export async function notifyLeadReviewRequest(
  service: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<{ outcome: DispatchOutcome }> {
  const settings = await getReviewMomentsSettings(service, tenantId);
  if (!settings.activeMoments.after_trial) return { outcome: "skipped" };

  const { data: lead } = await service
    .from("leads")
    .select("full_name, email")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!lead) return { outcome: "skipped" };

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "review_request");
  const origin = envPublicOrigin();
  const reviewUrl = settings.googleReviewUrl ?? (origin ? `${origin}/` : "/");
  const email = renderReviewRequest(
    branding,
    {
      studentName: (lead.full_name as string | null) ?? "cursist",
      moment: "after_trial",
      reviewUrl,
    },
    override,
  );

  return dispatch(service, {
    tenantId,
    type: "review_request",
    recipientEmail: (lead.email as string | null) ?? "",
    dedupeKey: `review_request:lead:${leadId}:after_trial`,
    relatedType: "lead",
    relatedId: leadId,
    email,
    fromName: branding.tenantName,
    payload: { moment: "after_trial" },
  });
}

/**
 * Evalueer — na het voltooien van een les — de lesgebonden reviewmomenten voor
 * een leerling: "na N voltooide lessen" (drempel tenant-configureerbaar) en het
 * "positieve voortgangsmijlpaal"-moment (leerling bereikt examenwaardig niveau).
 * Beide zijn idempotent (one-shot via de dedupe key). Best-effort: faalt nooit
 * de aanroepende lesactie.
 */
export async function maybeFireLessonReviewMoments(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<void> {
  try {
    const settings = await getReviewMomentsSettings(service, tenantId);

    if (settings.activeMoments.after_lessons) {
      const { count } = await service
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("student_id", studentId)
        .eq("status", "completed");
      if ((count ?? 0) >= settings.lessonThreshold) {
        await notifyStudentReviewRequest(
          service,
          tenantId,
          studentId,
          "after_lessons",
        );
      }
    }

    if (settings.activeMoments.progress_milestone) {
      const readiness = await loadStudentReadiness(service, tenantId, studentId);
      if (readiness.advice === "examenwaardig") {
        await notifyStudentReviewRequest(
          service,
          tenantId,
          studentId,
          "progress_milestone",
        );
      }
    }
  } catch (err) {
    console.error("[notifications] maybeFireLessonReviewMoments failed", {
      tenantId,
      studentId,
      err,
    });
  }
}

// ===========================================================================
// Task #131 — ouder-notificaties (nieuwe factuur / ingeplande les).
//
// Parents have a read-only portal (/ouder) but must check it manually. These
// helpers reuse the existing dispatch layer (white-label-aware, idempotent per
// stable dedupe key, degrades to 'skipped' without email/recipient) to mail +
// in-app notify every linked guardian (student_guardians) of the affected child
// when a new invoice or a scheduled lesson becomes ready.
//
// Per-guardian idempotency: the dedupe key embeds the guardian user id so each
// guardian gets exactly one email + one in-app message per source event, while
// adding a second guardian later still sends to that new guardian. Sent
// best-effort: one failing guardian never blocks the others.
//
// Per-section visibility: a tenant can hide portal sections via
// parent_portal_visibility (Task #96). We honour that here — a tenant that hid
// 'facturen' / 'planning' receives no corresponding parent notification.
// ===========================================================================

type GuardianRecipient = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Resolve every linked guardian of a student into a notification recipient
 * (auth user id + profile email + name). Tenant-scoped. Returns an empty array
 * when the child has no guardians. Service-role read: profiles/memberships RLS
 * only expose the caller's own row, so guardian names/emails must be resolved
 * with the service client by tenant-bounded ids.
 */
async function loadGuardiansForStudent(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<GuardianRecipient[]> {
  const { data: links } = await service
    .from("student_guardians")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId);
  const userIds = Array.from(
    new Set(
      (links ?? [])
        .map((l) => l.user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (userIds.length === 0) return [];

  const { data: profiles } = await service
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const byId = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        email: (p.email as string | null) ?? "",
        name: (p.full_name as string | null) ?? "ouder/verzorger",
      },
    ]),
  );

  return userIds.map((id) => ({
    userId: id,
    email: byId.get(id)?.email ?? "",
    name: byId.get(id)?.name ?? "ouder/verzorger",
  }));
}

/**
 * True when the tenant exposes the given parent-portal section to parents.
 * Defaults to visible (and never throws) so a settings read error can never
 * suppress a notification silently.
 */
async function parentSectionVisible(
  service: SupabaseClient,
  tenantId: string,
  section: ParentPortalSection,
): Promise<boolean> {
  try {
    const visibility = await loadParentPortalVisibility(service, tenantId);
    return visibility[section];
  } catch {
    return true;
  }
}

export type ParentNotifySummary = {
  outcome: "skipped" | "dispatched";
  guardians: number;
  outcomes: DispatchOutcome[];
};

/**
 * Notify all linked guardians that a new invoice is ready for their child.
 * Mirrors notifyInvoiceCreated's guard (open, kind 'invoice', not part of an
 * installment plan) so opening an installment plan never floods parents. No-op
 * (skipped) when the tenant hid the 'facturen' section, the invoice does not
 * qualify, or the child has no guardians. Idempotent per (invoice, guardian).
 */
export async function notifyParentsInvoiceReady(
  service: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<ParentNotifySummary> {
  const { data: invoice } = await service
    .from("invoices")
    .select(
      "id, status, kind, invoice_no, total_cents, due_date, student_id, installment_plan_id",
    )
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (
    !invoice ||
    invoice.status !== "open" ||
    invoice.kind !== "invoice" ||
    invoice.installment_plan_id !== null
  ) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  if (!(await parentSectionVisible(service, tenantId, "facturen"))) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  const studentId = invoice.student_id as string;
  const guardians = await loadGuardiansForStudent(service, tenantId, studentId);
  if (guardians.length === 0) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const childName = (student?.full_name as string | null) ?? "uw kind";

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "parent_invoice_ready");

  const outcomes: DispatchOutcome[] = [];
  for (const guardian of guardians) {
    const email = renderParentInvoiceReady(
      branding,
      {
        guardianName: guardian.name,
        childName,
        invoiceNo: invoice.invoice_no as number,
        amountCents: invoice.total_cents as number,
        dueDate: (invoice.due_date as string | null) ?? null,
      },
      override,
    );
    const { outcome } = await dispatch(service, {
      tenantId,
      type: "parent_invoice_ready",
      recipientEmail: guardian.email,
      dedupeKey: `parent_invoice_ready:invoice:${invoiceId}:guardian:${guardian.userId}`,
      relatedType: "invoice",
      relatedId: invoiceId,
      email,
      fromName: branding.tenantName,
      payload: {
        invoice_no: invoice.invoice_no,
        amount_cents: invoice.total_cents,
        student_id: studentId,
      },
      inApp: {
        recipientUserId: guardian.userId,
        title: "Nieuwe factuur",
        body: `Er staat een nieuwe factuur klaar voor ${childName} (#${invoice.invoice_no}).`,
        link: "/ouder",
        vars: {
          tenant_name: branding.tenantName,
          guardian_name: guardian.name,
          child_name: childName,
          invoice_no: String(invoice.invoice_no),
          amount: formatEuro(invoice.total_cents as number),
        },
      },
    });
    outcomes.push(outcome);
  }

  return { outcome: "dispatched", guardians: guardians.length, outcomes };
}

/**
 * Notify all linked guardians that their child's invoice has been paid. The
 * student already receives payment_confirmation via notifyInvoicePaid; this is
 * the parent-facing counterpart so a guardian who paid (or wants reassurance)
 * gets the same confirmation. No-op (skipped) when the invoice is not actually
 * paid, the tenant hid the 'betalingen' section, or the child has no guardians.
 * Idempotent per (invoice, guardian): the dedupe key embeds the guardian user
 * id, so webhook replays and re-recorded payments never double-send.
 */
export async function notifyParentsInvoicePaid(
  service: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<ParentNotifySummary> {
  const { data: invoice } = await service
    .from("invoices")
    .select("id, status, invoice_no, total_cents, paid_at, student_id")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice || invoice.status !== "paid") {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  if (!(await parentSectionVisible(service, tenantId, "betalingen"))) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  const studentId = invoice.student_id as string;
  const guardians = await loadGuardiansForStudent(service, tenantId, studentId);
  if (guardians.length === 0) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const childName = (student?.full_name as string | null) ?? "uw kind";

  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(service, tenantId, "parent_invoice_paid");

  const outcomes: DispatchOutcome[] = [];
  for (const guardian of guardians) {
    const email = renderParentInvoicePaid(
      branding,
      {
        guardianName: guardian.name,
        childName,
        invoiceNo: invoice.invoice_no as number,
        amountCents: invoice.total_cents as number,
        paidAt: (invoice.paid_at as string | null) ?? null,
      },
      override,
    );
    const { outcome } = await dispatch(service, {
      tenantId,
      type: "parent_invoice_paid",
      recipientEmail: guardian.email,
      dedupeKey: `parent_invoice_paid:invoice:${invoiceId}:guardian:${guardian.userId}`,
      relatedType: "invoice",
      relatedId: invoiceId,
      email,
      fromName: branding.tenantName,
      payload: {
        invoice_no: invoice.invoice_no,
        amount_cents: invoice.total_cents,
        student_id: studentId,
      },
      inApp: {
        recipientUserId: guardian.userId,
        title: "Betaling ontvangen",
        body: `De betaling voor factuur #${invoice.invoice_no} van ${childName} is verwerkt.`,
        link: "/ouder",
        vars: {
          tenant_name: branding.tenantName,
          guardian_name: guardian.name,
          child_name: childName,
          invoice_no: String(invoice.invoice_no),
          amount: formatEuro(invoice.total_cents as number),
        },
      },
    });
    outcomes.push(outcome);
  }

  return { outcome: "dispatched", guardians: guardians.length, outcomes };
}

/**
 * Notify all linked guardians that a rijles is scheduled for their child. No-op
 * (skipped) when the tenant hid the 'planning' section, the lesson is not
 * planned, or the child has no guardians. Idempotent per (lesson, guardian).
 */
export async function notifyParentsLessonScheduled(
  service: SupabaseClient,
  tenantId: string,
  lessonId: string,
): Promise<ParentNotifySummary> {
  const { data: lesson } = await service
    .from("lessons")
    .select("id, status, starts_at, location, instructor_id, student_id")
    .eq("id", lessonId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!lesson || lesson.status !== "planned") {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  if (!(await parentSectionVisible(service, tenantId, "planning"))) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  const studentId = lesson.student_id as string;
  const guardians = await loadGuardiansForStudent(service, tenantId, studentId);
  if (guardians.length === 0) {
    return { outcome: "skipped", guardians: 0, outcomes: [] };
  }

  const { data: student } = await service
    .from("students")
    .select("full_name")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const childName = (student?.full_name as string | null) ?? "uw kind";

  const instructorName = await instructorNameFor(
    service,
    (lesson.instructor_id as string | null) ?? null,
  );
  const branding = await loadEmailBranding(service, tenantId);
  const override = await loadOverride(
    service,
    tenantId,
    "parent_lesson_scheduled",
  );

  const outcomes: DispatchOutcome[] = [];
  for (const guardian of guardians) {
    const email = renderParentLessonScheduled(
      branding,
      {
        guardianName: guardian.name,
        childName,
        startsAt: lesson.starts_at as string,
        location: (lesson.location as string | null) ?? null,
        instructorName,
      },
      override,
    );
    const { outcome } = await dispatch(service, {
      tenantId,
      type: "parent_lesson_scheduled",
      recipientEmail: guardian.email,
      dedupeKey: `parent_lesson_scheduled:lesson:${lessonId}:guardian:${guardian.userId}`,
      relatedType: "lesson",
      relatedId: lessonId,
      email,
      fromName: branding.tenantName,
      payload: {
        starts_at: lesson.starts_at,
        student_id: studentId,
      },
      inApp: {
        recipientUserId: guardian.userId,
        title: "Rijles ingepland",
        body: `Er is een rijles ingepland voor ${childName} op ${formatWhenNL(lesson.starts_at as string)}.`,
        link: "/ouder",
        vars: {
          tenant_name: branding.tenantName,
          guardian_name: guardian.name,
          child_name: childName,
          lesson_time: formatWhenNL(lesson.starts_at as string),
          location: (lesson.location as string | null) ?? "",
          instructor_name: instructorName ?? "",
        },
      },
    });
    outcomes.push(outcome);
  }

  return { outcome: "dispatched", guardians: guardians.length, outcomes };
}
