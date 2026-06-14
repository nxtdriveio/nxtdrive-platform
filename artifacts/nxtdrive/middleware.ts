import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-options";

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

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase().split(":")[0];
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function buildRedirectUrl(request: NextRequest, pathname: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host && !isLocalHost(host)) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}${pathname}`;
  }

  const publicOrigin = process.env["NEXT_PUBLIC_APP_URL"];
  if (publicOrigin) {
    return new URL(pathname, publicOrigin).toString();
  }

  return new URL(pathname, request.url).toString();
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(),
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
    return NextResponse.redirect(buildRedirectUrl(request, CHANGE_PASSWORD_PATH));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/health|api/tls-check|_next/static|_next/image|favicon.ico|sw.js|.*\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
