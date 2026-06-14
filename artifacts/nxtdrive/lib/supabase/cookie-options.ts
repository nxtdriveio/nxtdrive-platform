const DEFAULT_SESSION_MAX_AGE_DAYS = 90;
const MIN_SESSION_MAX_AGE_DAYS = 1;
const MAX_SESSION_MAX_AGE_DAYS = 365;

function getSessionMaxAgeDays(): number {
  const raw = process.env["NXTDRIVE_SESSION_MAX_AGE_DAYS"];
  if (!raw) return DEFAULT_SESSION_MAX_AGE_DAYS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SESSION_MAX_AGE_DAYS;

  return Math.min(
    Math.max(parsed, MIN_SESSION_MAX_AGE_DAYS),
    MAX_SESSION_MAX_AGE_DAYS,
  );
}

export function getSupabaseSessionMaxAgeSeconds(): number {
  return 60 * 60 * 24 * getSessionMaxAgeDays();
}

/**
 * Shared auth-cookie policy for Supabase SSR + browser clients.
 *
 * We keep the cookie readable by the browser client (httpOnly: false) because
 * Supabase refreshes/persists the session from both the server and the PWA.
 * The important bit for persistence is an explicit maxAge so closing the PWA
 * does not immediately drop the session. Default is 90 days; override with
 * NXTDRIVE_SESSION_MAX_AGE_DAYS when production policy changes.
 */
export function getSupabaseCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    maxAge: getSupabaseSessionMaxAgeSeconds(),
  };
}
