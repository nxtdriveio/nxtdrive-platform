import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const CHANGE_PASSWORD_PATH = "/account/wachtwoord-wijzigen";

const BYPASS_PATHS = [
  "/login",
  "/auth",
  "/api/",
  "/intake/",
  "/privacy",
  CHANGE_PASSWORD_PATH,
];

function isBypassPath(pathname: string): boolean {
  return BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>,
      ) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options as never);
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // First-login gate: redirect to password change page if must_change_password
  // is set in user_metadata. Skip for logout/auth/intake/api routes and the
  // change-password page itself.
  if (
    user &&
    user.user_metadata?.["must_change_password"] === true &&
    !isBypassPath(request.nextUrl.pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = CHANGE_PASSWORD_PATH;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/health|api/tls-check|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
