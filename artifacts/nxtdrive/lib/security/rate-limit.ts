import { createServiceRoleClient } from "@/lib/supabase/service";

export type RateLimitPurpose =
  | "login"
  | "otp"
  | "password_recovery"
  | "invitation"
  | "student_create"
  | "email_change"
  | "public_form"
  | "upload"
  | "privacy_export"
  | "privacy_deletion"
  | "offline_sync"
  | "assessment_publish"
  | "readiness_recalculate"
  | "notification_action"
  | "maps_provider";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export const RATE_LIMIT_POLICIES: Record<
  RateLimitPurpose,
  { limit: number; windowSeconds: number }
> = {
  login: { limit: 10, windowSeconds: 15 * 60 },
  otp: { limit: 5, windowSeconds: 15 * 60 },
  password_recovery: { limit: 5, windowSeconds: 30 * 60 },
  invitation: { limit: 20, windowSeconds: 60 * 60 },
  student_create: { limit: 30, windowSeconds: 60 * 60 },
  email_change: { limit: 5, windowSeconds: 60 * 60 },
  public_form: { limit: 10, windowSeconds: 15 * 60 },
  upload: { limit: 30, windowSeconds: 15 * 60 },
  privacy_export: { limit: 3, windowSeconds: 24 * 60 * 60 },
  privacy_deletion: { limit: 3, windowSeconds: 24 * 60 * 60 },
  offline_sync: { limit: 240, windowSeconds: 60 * 60 },
  assessment_publish: { limit: 30, windowSeconds: 60 * 60 },
  readiness_recalculate: { limit: 120, windowSeconds: 60 * 60 },
  notification_action: { limit: 60, windowSeconds: 60 * 60 },
  maps_provider: { limit: 180, windowSeconds: 60 * 60 },
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function consumeRateLimit(input: {
  purpose: RateLimitPurpose;
  identifiers: string[];
}): Promise<RateLimitDecision> {
  const policy = RATE_LIMIT_POLICIES[input.purpose];
  const normalizedIdentifiers = input.identifiers
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  if (normalizedIdentifiers.length === 0) {
    throw new Error("A trusted rate-limit identifier is required.");
  }
  const bucketKey = await sha256(
    [input.purpose, ...normalizedIdentifiers].join(":"),
  );
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("consume_rate_limit", {
    p_bucket_key: bucketKey,
    p_purpose: input.purpose,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });
  if (error) {
    throw new Error("Rate limiting is temporarily unavailable.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Rate limiter returned an invalid response.");
  }
  return {
    allowed: row.allowed,
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
  };
}

export function rateLimitHeaders(
  decision: RateLimitDecision,
): Record<string, string> {
  return {
    "RateLimit-Remaining": String(Math.max(decision.remaining, 0)),
    ...(decision.retryAfterSeconds > 0
      ? { "Retry-After": String(decision.retryAfterSeconds) }
      : {}),
  };
}
