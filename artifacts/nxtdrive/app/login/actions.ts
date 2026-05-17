"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/redirect-by-role";
import { getPublicOrigin } from "@/lib/utils/public-origin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Vul een geldig e-mailadres in.")}`);
  }
  if (!password) {
    redirect(`/login?error=${encodeURIComponent("Vul je wachtwoord in.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const user = await getCurrentUser();
  redirect(user ? landingPathFor(user) : "/");
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Vul een geldig e-mailadres in.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const origin = await getPublicOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=1");
}
