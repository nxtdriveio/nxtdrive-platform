"use server";

import { revalidatePath } from "next/cache";

import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  canManageAgendaRow,
  requireAgendaAccessContext,
  requireAgendaAppointmentAccess,
  requireAgendaLessonAccess,
} from "@/lib/agenda/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { parseZonedDateTime, resolveTenantTimeZone } from "@/lib/datetime";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  rescheduleAppointment,
  type PlanningActorAccess,
  type PlanningCandidateInput,
  type PlanningScope,
  type PlanningValidationResult,
} from "@/lib/planning-core";
import {
  buildQueueCandidateInput,
  canManagePlanningQueueItem,
  loadPlanningQueueItem,
  planningActorForQueue,
  scheduleQueueItem,
  type PlanningQueueItem,
  validationToJson,
} from "@/lib/planning-queue";
import type {
  PlanningBoardDropResult,
  PlanningBoardPreviewResult,
} from "@/lib/planning-board";

type QueueDropInput = {
  queueItemId: string;
  instructorId: string;
  startsAt: string;
  vehicleId?: string | null;
};

type BoardEventEntityType = "lesson" | "trial_lesson" | "agenda_appointment";

type BoardEventMoveInput = {
  entityType: BoardEventEntityType;
  entityId: string;
  instructorId: string;
  startsAt: string;
  vehicleId?: string | null;
};

type TrialLessonMoveRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  lead_id: string;
  instructor_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  vehicle_id: string | null;
  pickup_service_area_id: string | null;
};

type QueueStudentBranchRow = {
  branch_id: string | null;
};

const QUEUE_STUDENT_BRANCH_MISMATCH_MESSAGE =
  "Deze leerling hoort bij een andere vestiging dan dit queue-item. Pas eerst de vestiging van de leerling of het queue-item aan.";

function validationMessage(validation: PlanningValidationResult): string {
  const reasons = validation.blockingReasons.length
    ? validation.blockingReasons
    : validation.warnings;
  return (
    reasons
      .map((reason) => humanizePlanningBoardError(reason.message))
      .join("; ") || "Geen details."
  );
}

function parseStart(
  value: string,
  context: Awaited<ReturnType<typeof requireAgendaAccessContext>>["context"],
): Date | null {
  return parseZonedDateTime(value, resolveTenantTimeZone(context.organization));
}

function humanizePlanningBoardError(message: string): string {
  if (
    message.includes("student branch does not match planning queue item branch")
  ) {
    return QUEUE_STUDENT_BRANCH_MISMATCH_MESSAGE;
  }
  if (
    message.includes("Cannot access") &&
    message.includes("before initialization")
  ) {
    return "De preview kon niet worden berekend. Probeer opnieuw of laad het planning board opnieuw.";
  }
  return message;
}

function queueBranchMismatchValidation(
  item: PlanningQueueItem,
  studentBranchId: string | null,
): PlanningValidationResult {
  return {
    allowed: false,
    blockingReasons: [
      {
        code: "QUEUE_STUDENT_BRANCH_MISMATCH",
        severity: "blocking",
        message: QUEUE_STUDENT_BRANCH_MISMATCH_MESSAGE,
        meta: {
          queueItemId: item.id,
          queueBranchId: item.branch_id,
          studentId: item.student_id,
          studentBranchId,
        },
      },
    ],
    warnings: [],
  };
}

async function validateQueueStudentBranch(
  service: ReturnType<typeof createServiceRoleClient>,
  item: PlanningQueueItem,
): Promise<PlanningValidationResult | null> {
  if (!item.student_id) return null;

  const { data, error } = await service
    .from("students")
    .select("branch_id")
    .eq("tenant_id", item.tenant_id)
    .eq("id", item.student_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Leerlingvestiging controleren mislukt: ${error.message}`);
  }

  const studentBranchId =
    ((data as QueueStudentBranchRow | null)?.branch_id ?? null) || null;
  const queueBranchId = item.branch_id ?? null;

  if (studentBranchId !== queueBranchId) {
    return queueBranchMismatchValidation(item, studentBranchId);
  }

  return null;
}

function agendaPlanningActor(
  context: Awaited<ReturnType<typeof requireAgendaAccessContext>>["context"],
  branchScope: Awaited<
    ReturnType<typeof requireAgendaAccessContext>
  >["branchScope"],
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

function agendaPlanningScope(
  tenantId: string,
  branchId: string | null,
): PlanningScope {
  return branchId
    ? { type: "branch", tenantId, branchId }
    : { type: "tenant", tenantId };
}

function durationBetween(startsAt: string, endsAt: string): number {
  return Math.max(5, new Date(endsAt).getTime() - new Date(startsAt).getTime());
}

async function loadTrialLessonForMove(
  service: ReturnType<typeof createServiceRoleClient>,
  input: BoardEventMoveInput,
): Promise<{
  context: Awaited<ReturnType<typeof requireAgendaAccessContext>>["context"];
  branchScope: Awaited<
    ReturnType<typeof requireAgendaAccessContext>
  >["branchScope"];
  trial: TrialLessonMoveRow | null;
}> {
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const { data, error } = await service
    .from("trial_lessons")
    .select(
      "id, tenant_id, branch_id, lead_id, instructor_id, starts_at, ends_at, status, vehicle_id, pickup_service_area_id",
    )
    .eq("id", input.entityId)
    .eq("tenant_id", context.organization.id)
    .maybeSingle();

  if (error) throw new Error(`Proefles laden mislukt: ${error.message}`);

  const trial = (data ?? null) as TrialLessonMoveRow | null;
  if (!trial || !canManageAgendaRow(context, branchScope, trial)) {
    return { context, branchScope, trial: null };
  }
  return { context, branchScope, trial };
}

async function buildBoardEventMoveCandidate(
  service: ReturnType<typeof createServiceRoleClient>,
  input: BoardEventMoveInput,
  startsAtValue: string,
): Promise<{
  candidate: PlanningCandidateInput;
  context: Awaited<ReturnType<typeof requireAgendaAccessContext>>["context"];
  previousInstructorId: string;
}> {
  if (input.entityType === "lesson") {
    const access = await requireAgendaLessonAccess(
      service,
      input.entityId,
      "manage",
    );
    if (!access.lesson) {
      throw new Error("Geen toegang tot deze rijles.");
    }
    const startsAt = parseStart(startsAtValue, access.context);
    if (!startsAt) throw new Error("Ongeldige agenda-tijd.");
    const endsAt = new Date(
      startsAt.getTime() +
        durationBetween(access.lesson.starts_at, access.lesson.ends_at),
    );
    return {
      context: access.context,
      previousInstructorId: access.lesson.instructor_id,
      candidate: {
        actor: agendaPlanningActor(access.context, access.branchScope),
        scope: agendaPlanningScope(
          access.context.organization.id,
          access.lesson.branch_id,
        ),
        entityType: "lesson",
        entityId: access.lesson.id,
        tenantId: access.context.organization.id,
        branchId: access.lesson.branch_id,
        studentId: access.lesson.student_id,
        instructorId: input.instructorId,
        vehicleId: input.vehicleId ?? access.lesson.vehicle_id ?? null,
        startAt: startsAt,
        endAt: endsAt,
        pickupServiceAreaId: access.lesson.pickup_service_area_id,
      },
    };
  }

  if (input.entityType === "trial_lesson") {
    const access = await loadTrialLessonForMove(service, input);
    if (!access.trial) {
      throw new Error("Geen toegang tot deze proefles.");
    }
    const startsAt = parseStart(startsAtValue, access.context);
    if (!startsAt) throw new Error("Ongeldige agenda-tijd.");
    const endsAt = new Date(
      startsAt.getTime() +
        durationBetween(access.trial.starts_at, access.trial.ends_at),
    );
    return {
      context: access.context,
      previousInstructorId: access.trial.instructor_id,
      candidate: {
        actor: agendaPlanningActor(access.context, access.branchScope),
        scope: agendaPlanningScope(
          access.context.organization.id,
          access.trial.branch_id,
        ),
        entityType: "trial_lesson",
        entityId: access.trial.id,
        tenantId: access.context.organization.id,
        branchId: access.trial.branch_id,
        studentId: null,
        instructorId: input.instructorId,
        vehicleId: input.vehicleId ?? access.trial.vehicle_id ?? null,
        startAt: startsAt,
        endAt: endsAt,
        pickupServiceAreaId: access.trial.pickup_service_area_id,
      },
    };
  }

  const access = await requireAgendaAppointmentAccess(
    service,
    input.entityId,
    "manage",
  );
  if (!access.appointment) {
    throw new Error("Geen toegang tot deze afspraak.");
  }
  const startsAt = parseStart(startsAtValue, access.context);
  if (!startsAt) throw new Error("Ongeldige agenda-tijd.");
  const endsAt = new Date(
    startsAt.getTime() +
      durationBetween(access.appointment.starts_at, access.appointment.ends_at),
  );
  return {
    context: access.context,
    previousInstructorId: access.appointment.instructor_id,
    candidate: {
      actor: agendaPlanningActor(access.context, access.branchScope),
      scope: agendaPlanningScope(
        access.context.organization.id,
        access.appointmentBranchId,
      ),
      entityType: "agenda_appointment",
      entityId: access.appointment.id,
      tenantId: access.context.organization.id,
      branchId: access.appointmentBranchId,
      studentId: access.appointment.student_id,
      instructorId: input.instructorId,
      vehicleId: input.vehicleId ?? access.appointment.vehicle_id ?? null,
      startAt: startsAt,
      endAt: endsAt,
      pickupServiceAreaId: access.appointment.pickup_service_area_id,
    },
  };
}

export async function previewQueueDropAction(
  input: QueueDropInput,
): Promise<PlanningBoardPreviewResult> {
  if (!input.startsAt || !input.queueItemId || !input.instructorId) {
    return { ok: false, message: "Ontbrekende of ongeldige dropgegevens." };
  }

  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const startsAt = parseStart(input.startsAt, context);
  if (!startsAt) {
    return { ok: false, message: "Ontbrekende of ongeldige dropgegevens." };
  }
  const item = await loadPlanningQueueItem(
    service,
    context,
    branchScope,
    input.queueItemId,
  );
  if (!item || !canManagePlanningQueueItem(context, branchScope, item)) {
    return { ok: false, message: "Geen toegang tot dit queue item." };
  }

  const branchValidation = await validateQueueStudentBranch(service, item);
  if (branchValidation) {
    return {
      ok: false,
      validation: branchValidation,
      message: validationMessage(branchValidation),
    };
  }

  const candidate = buildQueueCandidateInput({
    item,
    actor: planningActorForQueue(context, branchScope),
    instructorId: input.instructorId,
    startAt: startsAt,
    vehicleId: input.vehicleId ?? null,
  });
  const data = await loadPlanningKernelData(service, candidate);
  const validation = await getPlanningPreview(candidate, data);
  return {
    ok: validation.allowed,
    validation,
    message: validation.allowed ? undefined : validationMessage(validation),
  };
}

export async function scheduleQueueDropAction(
  input: QueueDropInput,
): Promise<PlanningBoardDropResult> {
  if (!input.startsAt || !input.queueItemId || !input.instructorId) {
    return { ok: false, message: "Ontbrekende of ongeldige dropgegevens." };
  }

  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const startsAt = parseStart(input.startsAt, context);
  if (!startsAt) {
    return { ok: false, message: "Ontbrekende of ongeldige dropgegevens." };
  }
  try {
    const item = await loadPlanningQueueItem(
      service,
      context,
      branchScope,
      input.queueItemId,
    );
    if (!item || !canManagePlanningQueueItem(context, branchScope, item)) {
      return {
        ok: false,
        scheduled: false,
        message: "Geen toegang tot dit queue item.",
      };
    }

    const branchValidation = await validateQueueStudentBranch(service, item);
    if (branchValidation) {
      return {
        ok: false,
        scheduled: false,
        validation: branchValidation,
        message: validationMessage(branchValidation),
      };
    }

    const result = await scheduleQueueItem(service, context, branchScope, {
      queueItemId: input.queueItemId,
      instructorId: input.instructorId,
      startAt: startsAt,
      vehicleId: input.vehicleId ?? null,
    });
    revalidatePath("/backoffice/planning-board");
    revalidatePath(`/backoffice/planning-board/instructors/${input.instructorId}`);
    revalidatePath("/backoffice/planning-queue");
    revalidatePath("/backoffice/agenda");
    return {
      ok: result.ok,
      scheduled: result.ok,
      entityId: result.ok ? result.entityId : null,
      validation: result.validation,
      message: result.ok ? undefined : validationMessage(result.validation),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? humanizePlanningBoardError(error.message)
          : "Plannen mislukt.",
    };
  }
}

export async function previewBoardEventMoveAction(
  input: BoardEventMoveInput,
): Promise<PlanningBoardPreviewResult> {
  if (!input.startsAt || !input.entityId || !input.entityType || !input.instructorId) {
    return {
      ok: false,
      message: "Ontbrekende of ongeldige verplaatsgegevens.",
    };
  }

  const service = createServiceRoleClient();
  try {
    const { candidate } = await buildBoardEventMoveCandidate(
      service,
      input,
      input.startsAt,
    );
    const data = await loadPlanningKernelData(service, candidate);
    const validation = await getPlanningPreview(candidate, data);
    return {
      ok: validation.allowed,
      validation,
      message: validation.allowed ? undefined : validationMessage(validation),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? humanizePlanningBoardError(error.message)
          : "Verplaatspreview mislukt.",
    };
  }
}

export async function rescheduleBoardEventAction(
  input: BoardEventMoveInput,
): Promise<PlanningBoardDropResult> {
  if (!input.startsAt || !input.entityId || !input.entityType || !input.instructorId) {
    return {
      ok: false,
      message: "Ontbrekende of ongeldige verplaatsgegevens.",
    };
  }

  const service = createServiceRoleClient();
  try {
    const { candidate, context, previousInstructorId } =
      await buildBoardEventMoveCandidate(service, input, input.startsAt);
    const startsAt =
      candidate.startAt instanceof Date
        ? candidate.startAt
        : new Date(candidate.startAt);
    const data = await loadPlanningKernelData(service, candidate);
    const { validation } = await rescheduleAppointment(
      candidate,
      data,
      async () => {
        const { error } = await service.rpc("reschedule_planning_board_event", {
          p_tenant_id: context.organization.id,
          p_actor: context.user.id,
          p_entity_type: input.entityType,
          p_entity_id: input.entityId,
          p_instructor_id: input.instructorId,
          p_starts_at: startsAt.toISOString(),
          p_vehicle_id: candidate.vehicleId ?? null,
          p_validation: validationToJson(validation),
        });
        if (error) throw new Error(error.message);
        return true;
      },
    );
    revalidatePath("/backoffice/planning-board");
    revalidatePath(
      `/backoffice/planning-board/instructors/${previousInstructorId}`,
    );
    revalidatePath(
      `/backoffice/planning-board/instructors/${input.instructorId}`,
    );
    revalidatePath("/backoffice/agenda");
    return {
      ok: true,
      scheduled: true,
      entityId: input.entityId,
      validation,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? humanizePlanningBoardError(error.message)
          : "Verplaatsen mislukt.",
    };
  }
}
