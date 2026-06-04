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

function envApiKey(): string | undefined {
  return process.env["SENDGRID_API_KEY"];
}

function envFromEmail(): string | undefined {
  return process.env["SENDGRID_FROM_EMAIL"];
}

/**
 * Whether a real email provider is wired up for this environment.
 * Checks the platform env vars only — does not query per-tenant config.
 */
export function isEmailConfigured(): boolean {
  return Boolean(envApiKey()) && Boolean(envFromEmail());
}

/**
 * Sends a single transactional email via the SendGrid v3 REST API.
 *
 * Uses platform-level SENDGRID_API_KEY / SENDGRID_FROM_EMAIL env vars.
 *
 * Returns a non-throwing `skipped` result when credentials are absent,
 * so the rest of the notification pipeline is fully exercised and the app
 * never crashes when email is unconfigured. On a real send it returns
 * `ok: true` with the provider message id, and `ok: false` (non-skipped) on a
 * provider error so the dispatcher records the attempt as 'failed'.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = envApiKey();
  const from = envFromEmail();

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
