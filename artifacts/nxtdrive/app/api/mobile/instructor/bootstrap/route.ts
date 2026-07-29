import type { NextRequest } from "next/server";
import { mobileError, requireMobileInstructor } from "@/lib/mobile/auth";
import { loadNativeInstructorBootstrap } from "@/lib/mobile/instructor-data";

export async function GET(request: NextRequest) {
  try {
    const context = await requireMobileInstructor(request);
    const payload = await loadNativeInstructorBootstrap(context);
    return Response.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return mobileError(error);
  }
}
