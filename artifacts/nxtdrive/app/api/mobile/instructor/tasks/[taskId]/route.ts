import type { NextRequest } from "next/server";
import {
  mobileError,
  MobileApiError,
  requireMobileInstructor,
} from "@/lib/mobile/auth";
import {
  deleteNativeInstructorTask,
  updateNativeInstructorTask,
} from "@/lib/mobile/instructor-tasks";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(request: NextRequest, route: RouteContext) {
  try {
    const context = await requireMobileInstructor(request);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      throw new MobileApiError(400, "Ongeldige taakgegevens.", "invalid_task");
    }
    const { taskId } = await route.params;
    const task = await updateNativeInstructorTask(context, taskId, body);
    return Response.json(
      { task },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileError(error);
  }
}

export async function DELETE(request: NextRequest, route: RouteContext) {
  try {
    const context = await requireMobileInstructor(request);
    const { taskId } = await route.params;
    await deleteNativeInstructorTask(context, taskId);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileError(error);
  }
}
