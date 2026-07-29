import { type NextRequest } from "next/server";
import {
  createMobileAuthClient,
  mobileError,
  MobileApiError,
} from "@/lib/mobile/auth";

const BEARER_RE = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/;
const REFRESH_TOKEN_RE = /^[A-Za-z0-9._~-]{20,8192}$/;

export async function POST(request: NextRequest) {
  try {
    const accessToken = BEARER_RE.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    const body = (await request.json().catch(() => null)) as {
      refreshToken?: unknown;
      everywhere?: unknown;
    } | null;
    const refreshToken = String(body?.refreshToken ?? "");
    if (!accessToken || !REFRESH_TOKEN_RE.test(refreshToken)) {
      throw new MobileApiError(
        401,
        "Er is geen geldige sessie om uit te loggen.",
        "invalid_session",
      );
    }

    const auth = createMobileAuthClient(accessToken);
    const { error: setError } = await auth.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setError) {
      throw new MobileApiError(
        401,
        "Je sessie was al verlopen of ingetrokken.",
        "invalid_session",
      );
    }
    const { error } = await auth.auth.signOut({
      scope: body?.everywhere === true ? "global" : "local",
    });
    if (error) {
      throw new MobileApiError(
        503,
        "De sessie kon niet op de server worden ingetrokken.",
        "logout_failed",
      );
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileError(error);
  }
}
