import type { NextRequest } from "next/server";
import {
  mobileError,
  MobileApiError,
  requireMobileInstructor,
} from "@/lib/mobile/auth";
import { createNativeInstructorStudent } from "@/lib/mobile/instructor-students";

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
        "Ongeldige leerlinggegevens.",
        "invalid_student",
      );
    }
    const result = await createNativeInstructorStudent(context, body);
    return Response.json(
      { ok: true, ...result },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return mobileError(error);
  }
}
