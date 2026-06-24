import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { getServerSupabaseAnonKey, getServerSupabaseUrl } from "@/lib/supabase/env";

const CHANGE_PASSWORD_PATH = "/account/wachtwoord-wijzigen";

const BYPASS_PATHS = [
  "/login",
  "/auth",
  "/api/",
  "/intake/",
  "/privacy",
  "/manifest.webmanifest",
  "/student/manifest.webmanifest",
  "/instructor/manifest.webmanifest",
];

const PROTECTED_PATHS = [
  "/admin",
  "/backoffice",
  "/student",
  "/instructor",
  "/ouder",
  "/account",
  "/select-tenant",
];

const PUBLIC_FILE_RE = /\.(?:css|js|map|json|webmanifest|svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$/i;

function isBypassPath(pathname: string): boolean {
  return BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function shouldSkipAuthRefresh(pathname: string): boolean {
  return isBypassPath(pathname) || PUBLIC_FILE_RE.test(pathname);
}

function withAppSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  return response;
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
  const pathname = request.nextUrl.pathname;

  if (!isProtectedPath(pathname) || shouldSkipAuthRefresh(pathname)) {
    return withAppSecurityHeaders(response);
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  try {
    supabaseUrl = getServerSupabaseUrl().url;
    supabaseAnonKey = getServerSupabaseAnonKey();
  } catch {
    return withAppSecurityHeaders(response);
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
    pathname !== CHANGE_PASSWORD_PATH
  ) {
    return withAppSecurityHeaders(
      NextResponse.redirect(buildRedirectUrl(request, CHANGE_PASSWORD_PATH)),
    );
  }

  return withAppSecurityHeaders(response);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/backoffice/:path*",
    "/student/:path*",
    "/instructor/:path*",
    "/ouder/:path*",
    "/account/:path*",
    "/select-tenant",
  ],
};
