import "server-only";

import type { MobileInstructorContext } from "@/lib/mobile/auth";
import { MobileApiError } from "@/lib/mobile/auth";
import { requireMobileInstructorStudent } from "@/lib/mobile/student-access";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
  type PlanningScope,
} from "@/lib/planning-core";
import { parseZonedDateTime, resolveTenantTimeZone } from "@/lib/datetime";

const APPOINTMENT_TYPES = new Set([
  "exam",
  "interim_test",
  "theory_guidance",
  "free_block",
  "break",
  "private_block",
  "maintenance",
  "admin",
  "vacation",
]);
const STUDENT_TYPES = new Set([
  "lesson",
  "exam",
  "interim_test",
  "theory_guidance",
]);

type NativePlanningInput = {
  type?: unknown;
  studentId?: unknown;
  startsAtLocal?: unknown;
  durationMinutes?: unknown;
  bufferMinutes?: unknown;
  title?: unknown;
  location?: unknown;
  notes?: unknown;
  vehicleId?: unknown;
};

export async function createNativePlanningItem(
  context: MobileInstructorContext,
  raw: NativePlanningInput,
) {
  const type = String(raw.type ?? "");
  if (type !== "lesson" && !APPOINTMENT_TYPES.has(type)) {
    throw new MobileApiError(
      400,
      "Kies een geldig afspraaktype.",
      "invalid_planning_type",
    );
  }
  const studentId = String(raw.studentId ?? "").trim() || null;
  if (STUDENT_TYPES.has(type) && !studentId) {
    throw new MobileApiError(
      400,
      "Kies een leerling voor deze afspraak.",
      "student_required",
    );
  }
  const durationMinutes = Number(raw.durationMinutes);
  const bufferMinutes = Number(raw.bufferMinutes ?? 0);
  const minimumDuration = type === "lesson" ? 15 : 5;
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < minimumDuration ||
    durationMinutes > 480
  ) {
    throw new MobileApiError(
      400,
      "Kies een geldige afspraakduur.",
      "invalid_duration",
    );
  }
  if (
    !Number.isInteger(bufferMinutes) ||
    bufferMinutes < 0 ||
    bufferMinutes > 120
  ) {
    throw new MobileApiError(
      400,
      "Kies een geldige buffertijd.",
      "invalid_buffer",
    );
  }
  const startsAt = parseZonedDateTime(
    String(raw.startsAtLocal ?? ""),
    resolveTenantTimeZone(context.tenant),
  );
  if (!startsAt || startsAt.getTime() < Date.now() - 5 * 60_000) {
    throw new MobileApiError(
      400,
      "Kies een geldig toekomstig tijdstip.",
      "invalid_start",
    );
  }

  const student = studentId
    ? await requireMobileInstructorStudent(context, studentId)
    : null;
  let branchId = (student?.branch_id as string | null | undefined) ?? null;
  if (context.branchIds !== "all") {
    if (branchId && !context.branchIds.includes(branchId)) {
      throw new MobileApiError(
        403,
        "Deze leerling valt buiten je vestigingstoegang.",
        "branch_access_denied",
      );
    }
    branchId = branchId ?? context.branchIds[0] ?? null;
    if (!branchId) {
      throw new MobileApiError(
        403,
        "Je account heeft geen actieve vestiging voor planning.",
        "branch_access_denied",
      );
    }
  }

  const vehicleId = String(raw.vehicleId ?? "").trim() || null;
  const location =
    String(raw.location ?? "")
      .trim()
      .slice(0, 200) || null;
  const notes =
    String(raw.notes ?? "")
      .trim()
      .slice(0, 1000) || null;
  const title =
    String(raw.title ?? "")
      .trim()
      .slice(0, 200) || null;
  const endsAt = new Date(
    startsAt.getTime() + (durationMinutes + bufferMinutes) * 60_000,
  );
  const actor: PlanningActorAccess = {
    userId: context.user.id,
    roles: context.roles,
    isPlatformAdmin: context.isPlatformAdmin,
    tenantIds: context.isAdmin ? [context.tenant.id] : [],
    branchAccess: [
      {
        tenantId: context.tenant.id,
        branchIds: context.branchIds,
      },
    ],
  };
  const scope: PlanningScope = branchId
    ? { type: "branch", tenantId: context.tenant.id, branchId }
    : { type: "tenant", tenantId: context.tenant.id };
  const planningInput = {
    actor,
    scope,
    entityType:
      type === "lesson" ? ("lesson" as const) : ("agenda_appointment" as const),
    entityId: null,
    tenantId: context.tenant.id,
    branchId,
    studentId,
    instructorId: context.user.id,
    vehicleId,
    startAt: startsAt,
    endAt: endsAt,
    pickupServiceAreaId: null,
  };
  const kernel = await loadPlanningKernelData(context.service, planningInput);
  const validation = await getPlanningPreview(planningInput, kernel);
  if (!validation.allowed) {
    throw new MobileApiError(
      409,
      validation.blockingReasons[0]?.message ??
        "Deze afspraak past niet in de planning.",
      "planning_conflict",
    );
  }

  if (type === "lesson") {
    const { data: lessonId, error } = await context.service.rpc(
      "schedule_lesson",
      {
        p_tenant_id: context.tenant.id,
        p_actor: context.user.id,
        p_instructor_id: context.user.id,
        p_student_id: studentId,
        p_starts_at: startsAt.toISOString(),
        p_duration_min: durationMinutes,
        p_location: location,
        p_notes: notes,
        p_location_lat: null,
        p_location_lng: null,
        p_location_place_id: null,
      },
    );
    if (error || !lessonId) {
      throw new MobileApiError(
        503,
        "De rijles kon niet worden ingepland.",
        "lesson_schedule_failed",
      );
    }
    const { error: metadataError } = await context.service
      .from("lessons")
      .update({
        ends_at: endsAt.toISOString(),
        duration_min: durationMinutes,
        buffer_min: bufferMinutes,
        branch_id: branchId,
        vehicle_id: vehicleId,
      })
      .eq("id", String(lessonId))
      .eq("tenant_id", context.tenant.id);
    if (metadataError) {
      throw new MobileApiError(
        503,
        "De les is aangemaakt maar metadata kon niet worden opgeslagen.",
        "lesson_metadata_failed",
      );
    }
    try {
      const { notifyParentsLessonScheduled } =
        await import("@/lib/notifications/dispatch");
      await notifyParentsLessonScheduled(
        context.service,
        context.tenant.id,
        String(lessonId),
      );
    } catch {
      // Planning is leading; notification delivery remains best-effort.
    }
    return { id: String(lessonId), kind: "lesson" };
  }

  const { data: appointmentId, error } = await context.service.rpc(
    "create_agenda_appointment",
    {
      p_tenant_id: context.tenant.id,
      p_actor: context.user.id,
      p_instructor_id: context.user.id,
      p_type: type,
      p_starts_at: startsAt.toISOString(),
      p_duration_min: durationMinutes + bufferMinutes,
      p_student_id: STUDENT_TYPES.has(type) ? studentId : null,
      p_branch_id: branchId,
      p_title: title,
      p_location: location,
      p_notes: notes,
      p_vehicle_id: vehicleId,
      p_pickup_service_area_id: null,
    },
  );
  if (error || !appointmentId) {
    throw new MobileApiError(
      503,
      "De afspraak kon niet worden ingepland.",
      "appointment_schedule_failed",
    );
  }
  const { error: metadataError } = await context.service
    .from("agenda_appointments")
    .update({
      duration_min: durationMinutes,
      buffer_min: bufferMinutes,
    })
    .eq("id", String(appointmentId))
    .eq("tenant_id", context.tenant.id);
  if (metadataError) {
    throw new MobileApiError(
      503,
      "De afspraak is aangemaakt maar metadata kon niet worden opgeslagen.",
      "appointment_metadata_failed",
    );
  }
  if ((type === "exam" || type === "interim_test") && studentId) {
    try {
      const { notifyExamPlanned } =
        await import("@/lib/notifications/dispatch");
      await notifyExamPlanned(
        context.service,
        context.tenant.id,
        String(appointmentId),
      );
    } catch {
      // Planning is leading; notification delivery remains best-effort.
    }
  }
  return { id: String(appointmentId), kind: type };
}
