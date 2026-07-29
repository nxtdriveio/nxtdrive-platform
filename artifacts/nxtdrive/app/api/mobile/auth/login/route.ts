import { type NextRequest } from "next/server";
import {
  createMobileAuthClient,
  mobileError,
  MobileApiError,
  resolveMobileInstructorContext,
  sessionEnvelope,
} from "@/lib/mobile/auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body?.password ?? "");
    if (
      !EMAIL_RE.test(email) ||
      email.length > 320 ||
      password.length < 1 ||
      password.length > 1024
    ) {
      throw new MobileApiError(
        400,
        "Vul een geldig e-mailadres en wachtwoord in.",
        "invalid_credentials",
      );
    }

    const forwardedFor = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const clientIp =
      forwardedFor ?? request.headers.get("x-real-ip") ?? "unavailable-ip";
    const limit = await consumeRateLimit({
      purpose: "login",
      identifiers: [clientIp, email],
    });
    if (!limit.allowed) {
      return Response.json(
        {
          error: "Te veel inlogpogingen. Probeer het later opnieuw.",
          code: "rate_limited",
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            ...rateLimitHeaders(limit),
          },
        },
      );
    }

    const auth = createMobileAuthClient();
    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session || !data.user) {
      throw new MobileApiError(
        401,
        "E-mailadres of wachtwoord is onjuist.",
        "invalid_credentials",
      );
    }
    const context = await resolveMobileInstructorContext(data.user);
    return Response.json(
      sessionEnvelope(data.session, data.user, context.tenant),
      {
        headers: {
          "Cache-Control": "no-store",
          ...rateLimitHeaders(limit),
        },
      },
    );
  } catch (error) {
    return mobileError(error);
  }
}
