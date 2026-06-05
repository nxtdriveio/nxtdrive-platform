import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/redirect-by-role";
import { getPublicOrigin } from "@/lib/utils/public-origin";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const explicitNext = url.searchParams.get("next");
  const origin = await getPublicOrigin();

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

  // Recovery sessions (password-reset flow) must land on the password-change
  // page — never on the normal role-based landing page. The user has a limited
  // session that only allows updating their password.
  const type = url.searchParams.get("type");
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/account/wachtwoord-wijzigen`);
  }

  let dest = "/";
  if (explicitNext && explicitNext.startsWith("/")) {
    dest = explicitNext;
  } else {
    const user = await getCurrentUser();
    if (user) dest = landingPathFor(user);
  }

  return NextResponse.redirect(`${origin}${dest}`);
}
