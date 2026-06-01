import type { RenderedEmail } from "./types";

export type SendEmailInput = {
  to: string;
  fromName: string;
  email: RenderedEmail;
};

export type SendEmailResult =
  | { ok: true; provider: string; providerMessageId: string | null }
  | { ok: false; skipped: boolean; provider: string | null; error: string };

const PROVIDER = "sendgrid";
const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

function apiKey(): string | undefined {
  return process.env["SENDGRID_API_KEY"];
}

/** Verified sender address SendGrid will deliver from (must be verified in SendGrid). */
function fromEmail(): string | undefined {
  return process.env["SENDGRID_FROM_EMAIL"];
}

/**
 * Whether a real email provider is wired up for this environment.
 *
 * Requires both a SendGrid API key and a verified sender address. When either is
 * missing, every send degrades gracefully: the attempt is still logged (as
 * 'skipped' with reason 'email_not_configured') and nothing throws.
 */
export function isEmailConfigured(): boolean {
  return Boolean(apiKey()) && Boolean(fromEmail());
}

/**
 * Sends a single transactional email via the SendGrid v3 REST API.
 *
 * Returns a non-throwing `skipped` result when the provider is not configured,
 * so the rest of the notification pipeline (enqueue, logging, idempotency) is
 * fully exercised and the app never crashes when email is unconfigured for an
 * environment. On a real send it returns `ok: true` with the provider message id
 * (from the `X-Message-Id` response header), and `ok: false` (non-skipped) on a
 * provider error so the dispatcher records the attempt as 'failed'.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = apiKey();
  const from = fromEmail();
  if (!key || !from) {
    return { ok: false, skipped: true, provider: null, error: "email_not_configured" };
  }

  let res: Response;
  try {
    res = await fetch(SENDGRID_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: from, name: input.fromName },
        subject: input.email.subject,
        content: [
          { type: "text/plain", value: input.email.text },
          { type: "text/html", value: input.email.html },
        ],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      provider: PROVIDER,
      error: `network_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.ok) {
    return {
      ok: true,
      provider: PROVIDER,
      providerMessageId: res.headers.get("x-message-id"),
    };
  }

  const detail = (await res.text().catch(() => "")).slice(0, 500);
  return {
    ok: false,
    skipped: false,
    provider: PROVIDER,
    error: `sendgrid_${res.status}: ${detail}`,
  };
}
