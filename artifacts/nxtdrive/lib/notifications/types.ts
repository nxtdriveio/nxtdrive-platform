export type NotificationType =
  | "payment_confirmation"
  | "lesson_reminder"
  | "task_assigned"
  | "trial_lesson_received"
  | "trial_lesson_confirmed"
  | "lesson_refill_invitation"
  | "lesson_refill_confirmed"
  | "slot_recovery_invitation"
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

/**
 * Student-facing notification categories used for per-type opt-in/out.
 * Each category groups one or more NotificationType values. Missing key in
 * the stored preferences object means the user is opted IN (default).
 *
 * Staff-facing notification types (task_assigned, payment_*, etc.) have no
 * category and are always dispatched.
 */
export type NotificationCategory =
  | "les_herinnering"
  | "proefles"
  | "tegoed_waarschuwing"
  | "examen_updates";

/** Human-readable Dutch label per category. */
export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  les_herinnering: "Lesherinneringen",
  proefles: "Proefles bevestiging",
  tegoed_waarschuwing: "Tegoed waarschuwing",
  examen_updates: "Examenupdates",
};

/** Human-readable Dutch description per category. */
export const NOTIFICATION_CATEGORY_DESCRIPTION: Record<NotificationCategory, string> = {
  les_herinnering: "Herinnering vóór je geplande les",
  proefles: "Bevestiging wanneer je proefles is ingepland",
  tegoed_waarschuwing: "Melding als je tegoed bijna op is",
  examen_updates: "Statuswijzigingen rondom je CBR-examen",
};

/** Ordered list of all student-facing categories. */
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "les_herinnering",
  "proefles",
  "tegoed_waarschuwing",
  "examen_updates",
];

/**
 * Map from a NotificationType to the student-facing category it belongs to.
 * Types absent from this map are staff-facing and are always sent regardless
 * of student preferences.
 */
export const NOTIFICATION_TYPE_CATEGORY: Partial<Record<NotificationType, NotificationCategory>> = {
  lesson_reminder: "les_herinnering",
  slot_recovery_invitation: "les_herinnering",
  trial_lesson_received: "proefles",
  trial_lesson_confirmed: "proefles",
  credit_low: "tegoed_waarschuwing",
  exam_invitation: "examen_updates",
  exam_confirmed: "examen_updates",
  exam_planned: "examen_updates",
  exam_passed: "examen_updates",
  exam_failed: "examen_updates",
  exam_day_reminder: "examen_updates",
};

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
  /**
   * Shortcode interpolation vars for platform/tenant in-app template overrides.
   * When a platform_notification_config or notification_templates row contains
   * {{student_name}} etc., these vars are substituted before the text is stored.
   * Call-site title/body (already rendered) are also passed through interpolate
   * but are unaffected since they contain no {{...}} placeholders.
   */
  vars?: Record<string, string>;
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
