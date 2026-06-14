const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Shared auth-cookie policy for Supabase SSR + browser clients.
 *
 * We keep the cookie readable by the browser client (httpOnly: false) because
 * Supabase refreshes/persists the session from both the server and the PWA.
 * The important bit for persistence is an explicit maxAge so closing the app
 * does not immediately drop the session.
 */
export function getSupabaseCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export { SESSION_MAX_AGE_SECONDS as SUPABASE_SESSION_MAX_AGE_SECONDS };
