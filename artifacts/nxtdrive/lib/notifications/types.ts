export type NotificationType =
  | "payment_confirmation"
  | "lesson_reminder"
  | "task_assigned"
  | "trial_lesson_received"
  | "trial_lesson_confirmed"
  | "lesson_refill_invitation"
  | "lesson_refill_confirmed"
  | "payment_reminder"
  | "exam_invitation"
  | "exam_confirmed"
  | "exam_planned"
  | "exam_passed"
  | "exam_failed"
  | "intake_received"
  | "lesson_cancelled"
  | "invoice_created"
  | "cbr_authorization_needed"
  | "credit_low"
  | "installment_due"
  | "exam_day_reminder"
  | "review_request"
  | "chat_message"
  | "parent_invoice_ready"
  | "parent_invoice_paid"
  | "parent_lesson_scheduled"
  | "lesson_rescheduled"
  | "lesson_rescheduled_instructor"
  | "student_welcome";

export type NotificationStatus = "queued" | "sent" | "failed" | "skipped";

/** Tenant identity + visual branding used to render branded emails. */
export type EmailBranding = {
  tenantName: string;
  whiteLabelEnabled: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/** Optional per-tenant template override loaded from notification_templates. */
export type TemplateOverride = {
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  enabled: boolean;
} | null;

export type DispatchOutcome =
  | "sent"
  | "skipped"
  | "failed"
  | "already_sent"
  | "skipped_no_recipient"
  | "enqueue_failed"
  | "status_update_failed"
  | "not_paid";

/**
 * The in-app counterpart of a notification: what to show in the bell when the
 * recipient is a logged-in user. Attached optionally to a dispatch so the same
 * key event produces both an email and an in-app message without divergence.
 */
export type InAppContent = {
  /** The auth user that should see this in their bell. Null = no in-app copy. */
  recipientUserId: string | null;
  title: string;
  body: string;
  /** In-app path to the relevant context (e.g. /student/facturen). */
  link: string | null;
};

/** A single in-app notification as read back for the bell / overview. */
export type InAppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  relatedType: string | null;
  relatedId: string | null;
  readAt: string | null;
  createdAt: string;
};
