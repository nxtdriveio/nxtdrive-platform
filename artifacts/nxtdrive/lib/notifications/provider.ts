import type { RenderedEmail } from "./types";

export type SendEmailInput = {
  to: string;
  fromName: string;
  email: RenderedEmail;
};

export type SendEmailResult =
  | { ok: true; provider: string; providerMessageId: string | null }
  | { ok: false; skipped: boolean; provider: string | null; error: string };

/**
 * Whether a real email provider is wired up for this environment.
 *
 * Until the SendGrid integration (connector) is connected, this returns false
 * and every send degrades gracefully: the attempt is still logged (as
 * 'skipped'), and nothing throws. Once SendGrid is connected, the actual
 * delivery is implemented in `sendEmail` below.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env["SENDGRID_API_KEY"]);
}

/**
 * Sends a single transactional email.
 *
 * Provider wiring (SendGrid) is added once the integration is connected. Until
 * then this returns a non-throwing `skipped` result so the rest of the
 * notification pipeline (enqueue, logging, idempotency) is fully exercised and
 * the app never crashes when email is not configured for a tenant.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  void input;
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, provider: null, error: "email_not_configured" };
  }
  // TODO(integration): deliver via the connected SendGrid client here.
  return { ok: false, skipped: true, provider: null, error: "email_not_configured" };
}
