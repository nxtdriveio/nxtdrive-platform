import type { NextRequest } from "next/server";
import {
  mobileError,
  MobileApiError,
  requireMobileInstructor,
} from "@/lib/mobile/auth";
import { createNativeInstructorTask } from "@/lib/mobile/instructor-tasks";

export async function POST(request: NextRequest) {
  try {
    const context = await requireMobileInstructor(request);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      throw new MobileApiError(400, "Ongeldige taakgegevens.", "invalid_task");
    }
    const task = await createNativeInstructorTask(context, body);
    return Response.json(
      { task },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return mobileError(error);
  }
}
