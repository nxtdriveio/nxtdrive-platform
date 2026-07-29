export const CORRELATION_ID_HEADER = "x-correlation-id";
export const CSP_NONCE_HEADER = "x-nonce";

const CORRELATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function normalizeCorrelationId(
  candidate: string | null | undefined,
  fallback: () => string,
): string {
  const value = candidate?.trim();
  return value && CORRELATION_ID_RE.test(value) ? value : fallback();
}

export function buildContentSecurityPolicy(input: {
  nonce: string;
  production: boolean;
  supabaseOrigin?: string | null;
}): string {
  const connectSources = new Set(["'self'", "https:", "wss:"]);
  if (input.supabaseOrigin) {
    try {
      connectSources.add(new URL(input.supabaseOrigin).origin);
    } catch {
      // An invalid optional origin must not weaken the policy.
    }
  }

  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'self'"],
    ["object-src", "'none'"],
    [
      "script-src",
      "'self'",
      `'nonce-${input.nonce}'`,
      "'strict-dynamic'",
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'", "data:"],
    ["connect-src", ...connectSources],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["media-src", "'self'", "blob:", "https:"],
    ["frame-src", "'self'", "https://www.openstreetmap.org"],
  ];

  if (input.production) {
    directives.push(["upgrade-insecure-requests"]);
  }

  return directives.map((parts) => parts.join(" ")).join("; ");
}

export function securityHeaders(input: {
  nonce: string;
  correlationId: string;
  production: boolean;
  supabaseOrigin?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(input),
    "Permissions-Policy":
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), publickey-credentials-get=(self), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    [CORRELATION_ID_HEADER]: input.correlationId,
  };

  if (input.production) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}
