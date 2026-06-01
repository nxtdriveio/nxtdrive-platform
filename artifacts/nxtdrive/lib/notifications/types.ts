export type NotificationType =
  | "payment_confirmation"
  | "lesson_reminder"
  | "task_assigned";

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
