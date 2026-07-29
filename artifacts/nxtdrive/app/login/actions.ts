"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/redirect-by-role";
import { getPublicOrigin } from "@/lib/utils/public-origin";
import {
  consumeRateLimit,
  type RateLimitDecision,
} from "@/lib/security/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_UPSTREAM_ERROR =
  "Inloggen lukt nu niet doordat de authenticatieserver niet bereikbaar is. Probeer het zo opnieuw of neem contact op met support.";

function loginErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  if (/fetch failed|failed to fetch|network|econnrefused|enotfound|timeout/i.test(message)) {
    return AUTH_UPSTREAM_ERROR;
  }

  return message || "Inloggen is mislukt. Controleer je gegevens en probeer opnieuw.";
}

async function enforceAuthenticationLimit(
  purpose: "login" | "otp",
  email: string,
) {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp =
    forwardedFor ?? requestHeaders.get("x-real-ip") ?? "unavailable-ip";
  let decision: RateLimitDecision;
  try {
    decision = await consumeRateLimit({
      purpose,
      identifiers: [clientIp, email],
    });
  } catch {
    redirect(
      `/login?error=${encodeURIComponent(
        "Inloggen is tijdelijk niet beschikbaar. Probeer het zo opnieuw.",
      )}`,
    );
  }
  if (!decision.allowed) {
    redirect(
      `/login?error=${encodeURIComponent(
        `Te veel pogingen. Probeer het over ${Math.max(
          Math.ceil(decision.retryAfterSeconds / 60),
          1,
        )} minuut opnieuw.`,
      )}`,
    );
  }
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Vul een geldig e-mailadres in.")}`);
  }
  if (!password) {
    redirect(`/login?error=${encodeURIComponent("Vul je wachtwoord in.")}`);
  }
  await enforceAuthenticationLimit("login", email);

  let error: unknown = null;
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.auth.signInWithPassword({ email, password });
    error = result.error;
  } catch (caught) {
    error = caught;
  }

  if (error) {
    redirect(`/login?error=${encodeURIComponent(loginErrorMessage(error))}`);
  }

  const user = await getCurrentUser();
  redirect(user ? landingPathFor(user) : "/");
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Vul een geldig e-mailadres in.")}`);
  }
  await enforceAuthenticationLimit("otp", email);

  const origin = await getPublicOrigin();
  let error: unknown = null;

  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });
    error = result.error;
  } catch (caught) {
    error = caught;
  }

  if (error) {
    redirect(`/login?error=${encodeURIComponent(loginErrorMessage(error))}`);
  }

  redirect("/login?sent=1");
}
