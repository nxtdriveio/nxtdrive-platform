"use server";

import { revalidatePath } from "next/cache";

import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  requireAgendaAccessContext,
  requireAgendaAppointmentAccess,
} from "@/lib/agenda/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  rescheduleAppointment,
  type PlanningActorAccess,
  type PlanningScope,
  type PlanningValidationResult,
} from "@/lib/planning-core";
import {
  buildQueueCandidateInput,
  canManagePlanningQueueItem,
  loadPlanningQueueItem,
  planningActorForQueue,
  scheduleQueueItem,
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

type AppointmentMoveInput = {
  appointmentId: string;
  instructorId: string;
  startsAt: string;
  vehicleId?: string | null;
};

function validationMessage(validation: PlanningValidationResult): string {
  const reasons = validation.blockingReasons.length
    ? validation.blockingReasons
    : validation.warnings;
  return reasons.map((reason) => reason.message).join("; ") || "Geen details.";
}

function parseStart(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

export async function previewQueueDropAction(
  input: QueueDropInput,
): Promise<PlanningBoardPreviewResult> {
  const startsAt = parseStart(input.startsAt);
  if (!startsAt || !input.queueItemId || !input.instructorId) {
    return { ok: false, message: "Ontbrekende of ongeldige dropgegevens." };
  }

  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const item = await loadPlanningQueueItem(
    service,
    context,
    branchScope,
    input.queueItemId,
  );
  if (!item || !canManagePlanningQueueItem(context, branchScope, item)) {
    return { ok: false, message: "Geen toegang tot dit queue item." };
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
  const startsAt = parseStart(input.startsAt);
  if (!startsAt || !input.queueItemId || !input.instructorId) {
    return { ok: false, message: "Ontbrekende of ongeldige dropgegevens." };
  }

  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  try {
    const result = await scheduleQueueItem(service, context, branchScope, {
      queueItemId: input.queueItemId,
      instructorId: input.instructorId,
      startAt: startsAt,
      vehicleId: input.vehicleId ?? null,
    });
    revalidatePath("/backoffice/planning-board");
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
      message: error instanceof Error ? error.message : "Plannen mislukt.",
    };
  }
}

export async function previewAppointmentMoveAction(
  input: AppointmentMoveInput,
): Promise<PlanningBoardPreviewResult> {
  const startsAt = parseStart(input.startsAt);
  if (!startsAt || !input.appointmentId || !input.instructorId) {
    return {
      ok: false,
      message: "Ontbrekende of ongeldige verplaatsgegevens.",
    };
  }

  const service = createServiceRoleClient();
  const access = await requireAgendaAppointmentAccess(
    service,
    input.appointmentId,
    "manage",
  );
  if (!access.appointment) {
    return { ok: false, message: "Geen toegang tot deze afspraak." };
  }
  if (input.instructorId !== access.appointment.instructor_id) {
    return {
      ok: false,
      message:
        "Bestaande afspraken kunnen in deze versie alleen binnen dezelfde instructeurkolom worden verplaatst.",
    };
  }

  const duration =
    new Date(access.appointment.ends_at).getTime() -
    new Date(access.appointment.starts_at).getTime();
  const endsAt = new Date(startsAt.getTime() + duration);
  const candidate = {
    actor: agendaPlanningActor(access.context, access.branchScope),
    scope: agendaPlanningScope(
      access.context.organization.id,
      access.appointmentBranchId,
    ),
    entityType: "agenda_appointment" as const,
    entityId: access.appointment.id,
    tenantId: access.context.organization.id,
    branchId: access.appointmentBranchId,
    studentId: access.appointment.student_id,
    instructorId: access.appointment.instructor_id,
    vehicleId: input.vehicleId ?? access.appointment.vehicle_id ?? null,
    startAt: startsAt,
    endAt: endsAt,
    pickupServiceAreaId: access.appointment.pickup_service_area_id,
  };
  const data = await loadPlanningKernelData(service, candidate);
  const validation = await getPlanningPreview(candidate, data);
  return {
    ok: validation.allowed,
    validation,
    message: validation.allowed ? undefined : validationMessage(validation),
  };
}

export async function rescheduleBoardAppointmentAction(
  input: AppointmentMoveInput,
): Promise<PlanningBoardDropResult> {
  const startsAt = parseStart(input.startsAt);
  if (!startsAt || !input.appointmentId || !input.instructorId) {
    return {
      ok: false,
      message: "Ontbrekende of ongeldige verplaatsgegevens.",
    };
  }

  const service = createServiceRoleClient();
  const access = await requireAgendaAppointmentAccess(
    service,
    input.appointmentId,
    "manage",
  );
  if (!access.appointment) {
    return { ok: false, message: "Geen toegang tot deze afspraak." };
  }
  if (input.instructorId !== access.appointment.instructor_id) {
    return {
      ok: false,
      message:
        "Bestaande afspraken kunnen in deze versie alleen binnen dezelfde instructeurkolom worden verplaatst.",
    };
  }

  const duration =
    new Date(access.appointment.ends_at).getTime() -
    new Date(access.appointment.starts_at).getTime();
  const durationMin = Math.round(duration / 60000);
  const endsAt = new Date(startsAt.getTime() + duration);
  const candidate = {
    actor: agendaPlanningActor(access.context, access.branchScope),
    scope: agendaPlanningScope(
      access.context.organization.id,
      access.appointmentBranchId,
    ),
    entityType: "agenda_appointment" as const,
    entityId: access.appointment.id,
    tenantId: access.context.organization.id,
    branchId: access.appointmentBranchId,
    studentId: access.appointment.student_id,
    instructorId: access.appointment.instructor_id,
    vehicleId: input.vehicleId ?? access.appointment.vehicle_id ?? null,
    startAt: startsAt,
    endAt: endsAt,
    pickupServiceAreaId: access.appointment.pickup_service_area_id,
  };
  const data = await loadPlanningKernelData(service, candidate);

  try {
    const { validation } = await rescheduleAppointment(
      candidate,
      data,
      async () => {
        const { error } = await service.rpc("update_agenda_appointment", {
          p_appointment_id: access.appointment!.id,
          p_tenant_id: access.context.organization.id,
          p_actor: access.context.user.id,
          p_starts_at: startsAt.toISOString(),
          p_duration_min: durationMin,
          p_student_id: access.appointment!.student_id,
          p_title: access.appointment!.title,
          p_location: access.appointment!.location,
          p_notes: access.appointment!.notes,
          p_branch_id: access.appointmentBranchId,
          p_vehicle_id:
            input.vehicleId ?? access.appointment!.vehicle_id ?? null,
          p_pickup_service_area_id: access.appointment!.pickup_service_area_id,
        });
        if (error) throw new Error(error.message);
        return true;
      },
    );
    revalidatePath("/backoffice/planning-board");
    revalidatePath("/backoffice/agenda");
    return {
      ok: true,
      scheduled: true,
      entityId: access.appointment.id,
      validation,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Verplaatsen mislukt.",
    };
  }
}
