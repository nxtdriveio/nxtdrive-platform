import type { NextRequest } from "next/server";
import {
  mobileError,
  MobileApiError,
  requireMobileInstructor,
} from "@/lib/mobile/auth";
import { parseInstructorCreditInput } from "@/lib/instructor/credits";
import { requireMobileInstructorStudent } from "@/lib/mobile/student-access";

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    const context = await requireMobileInstructor(request);
    const { studentId } = await route.params;
    const body = (await request.json().catch(() => null)) as {
      hours?: unknown;
      note?: unknown;
    } | null;
    const parsed = parseInstructorCreditInput({
      studentId,
      hours: body?.hours,
      note: body?.note,
    });
    if (!parsed.ok) {
      throw new MobileApiError(400, parsed.error, "invalid_credit");
    }
    await requireMobileInstructorStudent(context, studentId);
    const { error } = await context.service.rpc(
      "add_instructor_student_credits",
      {
        p_student_id: studentId,
        p_tenant_id: context.tenant.id,
        p_actor: context.user.id,
        p_delta_minutes: parsed.value.deltaMinutes,
        p_note: parsed.value.note,
      },
    );
    if (error) {
      throw new MobileApiError(
        503,
        "Het lestegoed kon niet worden toegevoegd.",
        "credit_add_failed",
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
