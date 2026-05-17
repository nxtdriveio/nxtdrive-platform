import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/redirect-by-role";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Ongeldige inloglink.")}`,
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Route by role: platform admin → /admin, single tenant → tenant dashboard,
  // multiple tenants → /select-tenant.
  let dest = "/";
  if (explicitNext && explicitNext.startsWith("/")) {
    dest = explicitNext;
  } else {
    const user = await getCurrentUser();
    if (user) dest = landingPathFor(user);
  }

  return NextResponse.redirect(`${origin}${dest}`);
}
