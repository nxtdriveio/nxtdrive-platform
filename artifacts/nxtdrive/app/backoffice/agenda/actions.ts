"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  canManageAgendaForInstructor,
  requireAgendaAccessContext,
  requireAgendaAppointmentAccess,
  requireAgendaLessonAccess,
} from "@/lib/agenda/access";
import { rolesGrantPermission } from "@/lib/permissions";
import { requireStudentBackofficeAccess } from "@/lib/students/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadRefillPolicy } from "@/lib/lesson-refill/policy";
import { loadExamInvitationPolicy } from "@/lib/exam-invitations/policy";
import { loadTenantInstructors } from "@/lib/availability/service";
import { parseZonedDateTime, resolveTenantTimeZone } from "@/lib/datetime";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
  type PlanningScope,
} from "@/lib/planning-core";
import {
  notifyLessonRefillInvitation,
  notifyExamInvitation,
  notifyLessonCancelled,
  notifyParentsLessonScheduled,
} from "@/lib/notifications/dispatch";

async function instructorCanServeBranch(
  tenantId: string,
  instructorId: string,
  branchId: string | null,
): Promise<boolean> {
  const instructors = await loadTenantInstructors(tenantId, {
    branchIds: branchId ? [branchId] : null,
  });
  return instructors.some((instructor) => instructor.id === instructorId);
}

type PlanningContext = Awaited<ReturnType<typeof requireAgendaAccessContext>>;

function actorForPlanningContext(
  context: PlanningContext["context"],
  branchScope: PlanningContext["branchScope"],
): PlanningActorAccess {
  const tenantId = context.organization.id;
  const canManageTenant =
    Boolean(context.user.profile?.is_platform_admin) ||
    context.roles.includes("tenant_admin") ||
    context.roles.includes("franchise_admin");
  return {
    userId: context.user.id,
    roles: context.roles,
    isPlatformAdmin: Boolean(context.user.profile?.is_platform_admin),
    tenantIds: canManageTenant ? [tenantId] : [],
    branchAccess: [
      {
        tenantId,
        branchIds:
          branchScope.scope_type === "all" ? "all" : branchScope.branch_ids,
      },
    ],
  };
}

function scopeForTenantBranch(
  tenantId: string,
  branchId: string | null | undefined,
): PlanningScope {
  return branchId
    ? { type: "branch", tenantId, branchId }
    : { type: "tenant", tenantId };
}

function planningMessage(
  blockingReasons: readonly { message: string }[],
): string {
  return (
    blockingReasons[0]?.message ?? "Deze planning past niet binnen de regels."
  );
}

export async function scheduleLesson(formData: FormData) {
  const requestedInstructorId = String(
    formData.get("instructor_id") ?? "",
  ).trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = parseInt(String(formData.get("duration_min") ?? "60"), 10);
  const buffer = parseInt(String(formData.get("buffer_min") ?? "0"), 10);
  const location = String(formData.get("location") ?? "")
    .trim()
    .slice(0, 200);
  const notes = String(formData.get("notes") ?? "")
    .trim()
    .slice(0, 1000);
  const vehicleId = String(formData.get("vehicle_id") ?? "").trim() || null;
  const pickupServiceAreaId =
    String(formData.get("pickup_service_area_id") ?? "").trim() || null;

  // Fase 3 - optional precise location coordinates (graceful: null without Places).
  const parseCoord = (raw: FormDataEntryValue | null, max: number) => {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= -max && n <= max ? n : null;
  };
  const locationLat = parseCoord(formData.get("location_lat"), 90);
  const locationLng = parseCoord(formData.get("location_lng"), 180);
  const hasCoords = locationLat !== null && locationLng !== null;
  const locationPlaceId = hasCoords
    ? String(formData.get("location_place_id") ?? "")
        .trim()
        .slice(0, 300) || null
    : null;
  const redirectTo =
    String(formData.get("redirect_to") ?? "/backoffice/agenda").trim() ||
    "/backoffice/agenda";
  const errorTo =
    String(formData.get("error_to") ?? "/backoffice/agenda/nieuw").trim() ||
    "/backoffice/agenda/nieuw";
  const detailBase =
    String(formData.get("detail_base") ?? "/backoffice/agenda").trim() ||
    "/backoffice/agenda";

  if (!studentId || !date || !time) {
    redirect(`${errorTo}?error=missing`);
  }
  if (!Number.isFinite(duration) || duration < 15) {
    redirect(`${errorTo}?error=duration`);
  }
  if (!Number.isFinite(buffer) || buffer < 0) {
    redirect(`${errorTo}?error=buffer`);
  }

  const service = createServiceRoleClient();
  const studentAccess = await requireStudentBackofficeAccess(
    service,
    studentId,
    "read",
    { allowedRoles: [...AGENDA_BACKOFFICE_MANAGE_ROLES] },
  );
  if (!studentAccess.student) {
    redirect(`${errorTo}?error=forbidden`);
  }

  const { context } = studentAccess;
  const startsAt = parseZonedDateTime(
    `${date}T${time}:00`,
    resolveTenantTimeZone(context.organization),
  );
  if (!startsAt) {
    redirect(`${errorTo}?error=date`);
  }
  const canAssignInstructor =
    context.user.profile?.is_platform_admin ||
    rolesGrantPermission(context.roles, "planning:manage");
  const instructorId = canAssignInstructor
    ? requestedInstructorId
    : context.user.id;
  if (!instructorId) redirect(`${errorTo}?error=missing`);
  if (!canManageAgendaForInstructor(context, instructorId)) {
    redirect(`${errorTo}?error=forbidden`);
  }
  if (!canAssignInstructor) {
    const taughtStudentIds = await import("@/lib/students/access").then(
      (module) =>
        module.loadInstructorAccessibleStudentIds(
          service,
          context.organization.id,
          context.user.id,
        ),
    );
    if (!taughtStudentIds.includes(studentId)) {
      redirect(`${errorTo}?error=forbidden`);
    }
  }
  if (
    !(await instructorCanServeBranch(
      context.organization.id,
      instructorId,
      studentAccess.student.branch_id,
    ))
  ) {
    redirect(`${errorTo}?error=forbidden`);
  }

  const occupied = duration + buffer;
  const endsAt = new Date(startsAt.getTime() + occupied * 60000);
  const planningInput = {
    actor: actorForPlanningContext(context, studentAccess.branchScope),
    scope: scopeForTenantBranch(
      context.organization.id,
      studentAccess.student.branch_id,
    ),
    entityType: "lesson" as const,
    entityId: null,
    tenantId: context.organization.id,
    branchId: studentAccess.student.branch_id,
    instructorId,
    vehicleId,
    startAt: startsAt,
    endAt: endsAt,
    pickupServiceAreaId,
  };
  const kernelData = await loadPlanningKernelData(service, planningInput);
  const validation = await getPlanningPreview(planningInput, kernelData);
  if (!validation.allowed) {
    redirect(
      `${errorTo}?error=${encodeURIComponent(
        planningMessage(validation.blockingReasons),
      )}`,
    );
  }

  const { data: lessonId, error } = await service.rpc("schedule_lesson", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_instructor_id: instructorId,
    p_student_id: studentId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: duration,
    p_location: location || null,
    p_notes: notes || null,
    p_location_lat: locationLat,
    p_location_lng: locationLng,
    p_location_place_id: locationPlaceId,
  });
  if (error || !lessonId) {
    const code = encodeURIComponent(error?.message ?? "unknown");
    redirect(`${errorTo}?error=${code}`);
  }
  const { error: metadataError } = await service
    .from("lessons")
    .update({
      ends_at: endsAt.toISOString(),
      duration_min: duration,
      buffer_min: buffer,
      branch_id: studentAccess.student.branch_id,
      vehicle_id: vehicleId,
      pickup_service_area_id: pickupServiceAreaId,
    })
    .eq("id", lessonId as string)
    .eq("tenant_id", context.organization.id);
  if (metadataError) {
    redirect(`${errorTo}?error=${encodeURIComponent(metadataError.message)}`);
  }

  // Task #131 - notify linked guardians that a driving lesson was scheduled.
  // Best-effort and idempotent; notification failures must never block planning.
  try {
    await notifyParentsLessonScheduled(
      service,
      context.organization.id,
      lessonId as string,
    );
  } catch (err) {
    console.error("[agenda] notifyParentsLessonScheduled failed", err);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructeur/agenda/nieuw");
  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath(`/instructeur/leerlingen/${studentId}`);
  revalidatePath("/instructeur/agenda");
  if (String(formData.get("return_to_calendar") ?? "") === "true") {
    redirect(redirectTo);
  }
  redirect(`${detailBase}/${lessonId as string}`);
}

export async function completeLesson(formData: FormData) {
  const lessonId = String(formData.get("lesson_id") ?? "");
  if (!lessonId) redirect("/backoffice/agenda");

  const service = createServiceRoleClient();
  const { context, lesson } = await requireAgendaLessonAccess(
    service,
    lessonId,
    "manage",
  );
  if (!lesson) redirect(`/backoffice/agenda/${lessonId}?error=forbidden`);

  const { error } = await service.rpc("complete_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
  });
  if (error) redirect(`/backoffice/agenda/${lessonId}?error=complete`);

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}

export type RefillActionResult = { ok: boolean; error?: string };

/**
 * Invite a single opted-in student to a freed slot (wachtlijst). Staff-only.
 * Loads the tenant's refill policy and forwards enabled / validity / max-
 * concurrent to the locked create RPC, which re-validates the slot is free,
 * enforces the rules and prevents duplicate pendings. On success the student is
 * notified by email (degrades gracefully). Nothing is booked here - the student
 * confirms in their PWA.
 */
export async function inviteStudentToSlot(
  formData: FormData,
): Promise<RefillActionResult> {
  const studentId = String(formData.get("student_id") ?? "").trim();
  const instructorId = String(formData.get("instructor_id") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const duration = parseInt(String(formData.get("duration_min") ?? "0"), 10);
  const sourceLessonId =
    String(formData.get("source_lesson_id") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "")
    .trim()
    .slice(0, 200);
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  const scoreRaw = parseInt(String(formData.get("score") ?? "0"), 10);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

  if (!studentId || !instructorId || !startsAt) {
    return { ok: false, error: "Ontbrekende gegevens voor de uitnodiging." };
  }
  if (!Number.isFinite(duration) || duration < 15) {
    return { ok: false, error: "Ongeldige lesduur." };
  }
  const startsDate = new Date(startsAt);
  if (Number.isNaN(startsDate.getTime())) {
    return { ok: false, error: "Ongeldig tijdstip." };
  }

  const service = createServiceRoleClient();
  const studentAccess = await requireStudentBackofficeAccess(
    service,
    studentId,
    "read",
    { allowedRoles: [...AGENDA_BACKOFFICE_MANAGE_ROLES] },
  );
  if (!studentAccess.student) {
    return { ok: false, error: "Geen toegang tot deze leerling." };
  }
  const { context } = studentAccess;

  if (sourceLessonId) {
    const sourceAccess = await requireAgendaLessonAccess(
      service,
      sourceLessonId,
      "manage",
    );
    if (!sourceAccess.lesson) {
      return { ok: false, error: "Geen toegang tot dit vrijgekomen lesblok." };
    }
  }
  if (!canManageAgendaForInstructor(context, instructorId)) {
    return { ok: false, error: "Geen toegang tot deze instructeuragenda." };
  }
  if (
    !(await instructorCanServeBranch(
      context.organization.id,
      instructorId,
      studentAccess.student.branch_id,
    ))
  ) {
    return { ok: false, error: "Geen toegang tot deze instructeurvestiging." };
  }

  const policy = await loadRefillPolicy(service, context.organization.id);
  if (!policy.enabled) {
    return {
      ok: false,
      error: "Herbezet-uitnodigingen staan uit in de instellingen.",
    };
  }

  const { data: invitationId, error } = await service.rpc(
    "create_lesson_refill_invitation",
    {
      p_tenant_id: context.organization.id,
      p_actor: context.user.id,
      p_student_id: studentId,
      p_instructor_id: instructorId,
      p_starts_at: startsDate.toISOString(),
      p_duration_min: duration,
      p_enabled: policy.enabled,
      p_valid_minutes: policy.valid_minutes,
      p_max_candidates: policy.max_candidates,
      p_location: location || null,
      p_source_lesson_id: sourceLessonId,
      p_score: score,
      p_reason: reason || null,
    },
  );
  if (error || !invitationId) {
    return { ok: false, error: error?.message ?? "Uitnodigen mislukt." };
  }

  await notifyLessonRefillInvitation(
    service,
    context.organization.id,
    invitationId as string,
  );

  revalidatePath("/backoffice/agenda");
  if (sourceLessonId) revalidatePath(`/backoffice/agenda/${sourceLessonId}`);
  return { ok: true };
}

/**
 * Cancel an open refill invitation (staff-only). The locked cancel RPC marks it
 * cancelled and writes the audit row, freeing the slot to be offered again.
 */
export async function cancelRefillInvitation(
  formData: FormData,
): Promise<RefillActionResult> {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const sourceLessonId =
    String(formData.get("source_lesson_id") ?? "").trim() || null;
  if (!invitationId) return { ok: false, error: "Uitnodiging ontbreekt." };

  const service = createServiceRoleClient();
  const context = sourceLessonId
    ? (await requireAgendaLessonAccess(service, sourceLessonId, "manage"))
        .context
    : (
        await requireAgendaAccessContext(
          service,
          AGENDA_BACKOFFICE_MANAGE_ROLES,
        )
      ).context;

  if (sourceLessonId) {
    const sourceAccess = await requireAgendaLessonAccess(
      service,
      sourceLessonId,
      "manage",
    );
    if (!sourceAccess.lesson) {
      return { ok: false, error: "Geen toegang tot dit vrijgekomen lesblok." };
    }
  } else if (
    !context.user.profile?.is_platform_admin &&
    !rolesGrantPermission(context.roles, "planning:manage")
  ) {
    return { ok: false, error: "Geen toegang tot deze uitnodiging." };
  }

  const { error } = await service.rpc("cancel_lesson_refill_invitation", {
    p_invitation_id: invitationId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/agenda");
  if (sourceLessonId) revalidatePath(`/backoffice/agenda/${sourceLessonId}`);
  return { ok: true };
}

/**
 * Invite a single suitable student to an open exam moment (Task #102). Loads the
 * tenant's exam-invitation policy and forwards enabled / validity / max-
 * concurrent to the locked create RPC, which re-validates the moment is still
 * open, enforces the rules and prevents duplicate invitations. On success the
 * student is notified by email (degrades gracefully). Nothing is booked here -
 * the student confirms in their PWA, and an exam never consumes credit.
 */
export async function inviteExamCandidate(
  formData: FormData,
): Promise<RefillActionResult> {
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  const scoreRaw = parseInt(String(formData.get("score") ?? "0"), 10);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

  if (!appointmentId || !studentId) {
    return { ok: false, error: "Ontbrekende gegevens voor de uitnodiging." };
  }

  const service = createServiceRoleClient();
  const appointmentAccess = await requireAgendaAppointmentAccess(
    service,
    appointmentId,
    "manage",
  );
  if (!appointmentAccess.appointment) {
    return { ok: false, error: "Geen toegang tot dit examenmoment." };
  }

  const studentAccess = await requireStudentBackofficeAccess(
    service,
    studentId,
    "read",
    { allowedRoles: [...AGENDA_BACKOFFICE_MANAGE_ROLES] },
  );
  if (!studentAccess.student) {
    return { ok: false, error: "Geen toegang tot deze leerling." };
  }

  const { context } = appointmentAccess;
  const policy = await loadExamInvitationPolicy(
    service,
    context.organization.id,
  );
  if (!policy.enabled) {
    return {
      ok: false,
      error: "Examenuitnodigingen staan uit in de instellingen.",
    };
  }

  const { data: invitationId, error } = await service.rpc(
    "create_exam_invitation",
    {
      p_tenant_id: context.organization.id,
      p_actor: context.user.id,
      p_appointment_id: appointmentId,
      p_student_id: studentId,
      p_enabled: policy.enabled,
      p_valid_minutes: policy.valid_minutes,
      p_max_candidates: policy.max_candidates,
      p_score: score,
      p_reason: reason || null,
    },
  );
  if (error || !invitationId) {
    return { ok: false, error: error?.message ?? "Uitnodigen mislukt." };
  }

  await notifyExamInvitation(
    service,
    context.organization.id,
    invitationId as string,
  );

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/afspraak/${appointmentId}`);
  return { ok: true };
}

/**
 * Cancel an open exam invitation (staff-only). The locked cancel RPC marks it
 * cancelled and writes the audit row.
 */
export async function cancelExamInvitation(
  formData: FormData,
): Promise<RefillActionResult> {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!invitationId) return { ok: false, error: "Uitnodiging ontbreekt." };

  const service = createServiceRoleClient();
  const context = appointmentId
    ? (await requireAgendaAppointmentAccess(service, appointmentId, "manage"))
        .context
    : (
        await requireAgendaAccessContext(
          service,
          AGENDA_BACKOFFICE_MANAGE_ROLES,
        )
      ).context;

  if (appointmentId) {
    const appointmentAccess = await requireAgendaAppointmentAccess(
      service,
      appointmentId,
      "manage",
    );
    if (!appointmentAccess.appointment) {
      return { ok: false, error: "Geen toegang tot dit examenmoment." };
    }
  } else if (
    !context.user.profile?.is_platform_admin &&
    !rolesGrantPermission(context.roles, "planning:manage")
  ) {
    return { ok: false, error: "Geen toegang tot deze uitnodiging." };
  }

  const { error } = await service.rpc("cancel_exam_invitation", {
    p_invitation_id: invitationId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/agenda");
  if (appointmentId) {
    revalidatePath(`/backoffice/agenda/afspraak/${appointmentId}`);
  }
  return { ok: true };
}

export async function cancelLesson(formData: FormData) {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  if (!lessonId) redirect("/backoffice/agenda");

  const service = createServiceRoleClient();
  const { context, lesson } = await requireAgendaLessonAccess(
    service,
    lessonId,
    "manage",
  );
  if (!lesson) redirect(`/backoffice/agenda/${lessonId}?error=forbidden`);

  const { error } = await service.rpc("cancel_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_reason: reason || null,
  });
  if (error) redirect(`/backoffice/agenda/${lessonId}?error=cancel`);

  // Task #107 - notify the student that the lesson was cancelled. Best-effort
  // and idempotent; notification failures must never fail the cancellation.
  try {
    await notifyLessonCancelled(service, context.organization.id, lessonId);
  } catch (e) {
    console.error("[agenda] notifyLessonCancelled failed", e);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}
