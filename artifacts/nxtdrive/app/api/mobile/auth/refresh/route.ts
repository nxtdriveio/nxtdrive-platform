import { type NextRequest } from "next/server";
import {
  createMobileAuthClient,
  mobileError,
  MobileApiError,
  resolveMobileInstructorContext,
  sessionEnvelope,
} from "@/lib/mobile/auth";

const REFRESH_TOKEN_RE = /^[A-Za-z0-9._~-]{20,8192}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      refreshToken?: unknown;
      tenantId?: unknown;
    } | null;
    const refreshToken = String(body?.refreshToken ?? "");
    const tenantId =
      typeof body?.tenantId === "string" ? body.tenantId.trim() : null;
    if (!REFRESH_TOKEN_RE.test(refreshToken)) {
      throw new MobileApiError(
        401,
        "Je sessie kan niet worden vernieuwd. Log opnieuw in.",
        "invalid_refresh_token",
      );
    }
    if (tenantId && !UUID_RE.test(tenantId)) {
      throw new MobileApiError(
        400,
        "De geselecteerde rijschool is ongeldig.",
        "invalid_tenant",
      );
    }

    const auth = createMobileAuthClient();
    const { data, error } = await auth.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session || !data.user) {
      throw new MobileApiError(
        401,
        "Je sessie is verlopen of ingetrokken. Log opnieuw in.",
        "invalid_refresh_token",
      );
    }
    let context: Awaited<ReturnType<typeof resolveMobileInstructorContext>>;
    try {
      context = await resolveMobileInstructorContext(data.user, tenantId);
    } catch (contextError) {
      if (
        tenantId &&
        contextError instanceof MobileApiError &&
        contextError.code === "tenant_access_denied"
      ) {
        context = await resolveMobileInstructorContext(data.user);
      } else {
        throw contextError;
      }
    }
    return Response.json(
      sessionEnvelope(data.session, data.user, context.tenant),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileError(error);
  }
}
