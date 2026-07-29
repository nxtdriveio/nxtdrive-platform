import type { NextRequest } from "next/server";
import {
  mobileError,
  MobileApiError,
  requireMobileInstructor,
} from "@/lib/mobile/auth";
import { createNativePlanningItem } from "@/lib/mobile/instructor-planning";

export async function POST(request: NextRequest) {
  try {
    const context = await requireMobileInstructor(request);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      throw new MobileApiError(
        400,
        "Ongeldige planningsgegevens.",
        "invalid_planning",
      );
    }
    const item = await createNativePlanningItem(context, body);
    return Response.json(
      { ok: true, item },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return mobileError(error);
  }
}
