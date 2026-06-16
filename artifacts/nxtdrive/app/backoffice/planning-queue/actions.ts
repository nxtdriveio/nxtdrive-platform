"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  cancelPlanningQueueItem,
  createPlanningQueueItem,
  scheduleQueueItem,
  suggestPlanningQueueItem,
  updatePlanningQueueItem,
  type PlanningQueueAppointmentType,
  type PlanningQueuePriority,
} from "@/lib/planning-queue";

const PAGE = "/backoffice/planning-queue";

function text(raw: FormDataEntryValue | null, max = 500): string | null {
  const value = String(raw ?? "")
    .trim()
    .slice(0, max);
  return value || null;
}

function int(raw: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strings(formData: FormData, name: string): string[] {
  return Array.from(
    new Set(
      formData
        .getAll(name)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
}

function safeRedirect(raw: FormDataEntryValue | null, fallback = PAGE): string {
  const value = String(raw ?? "").trim();
  return value.startsWith("/") ? value : fallback;
}

async function queueContext() {
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  return { service, context, branchScope };
}

function queueInputFromForm(formData: FormData) {
  return {
    id: text(formData.get("queue_item_id"), 80),
    branchId: text(formData.get("branch_id"), 80),
    studentId: text(formData.get("student_id"), 80),
    leadId: text(formData.get("lead_id"), 80),
    appointmentType: (text(formData.get("appointment_type"), 60) ??
      "exam") as PlanningQueueAppointmentType,
    durationMinutes: int(formData.get("duration_minutes"), 60),
    requiredTransmission: text(formData.get("required_transmission"), 20) as
      | "schakel"
      | "automaat"
      | null,
    preferredInstructorId: text(formData.get("preferred_instructor_id"), 80),
    pickupAddressId: text(formData.get("pickup_address_id"), 240),
    pickupServiceAreaId: text(formData.get("pickup_service_area_id"), 80),
    desiredDateFrom: text(formData.get("desired_date_from"), 10),
    desiredDateUntil: text(formData.get("desired_date_until"), 10),
    priority: (text(formData.get("priority"), 20) ??
      "normal") as PlanningQueuePriority,
    requiredCapabilityIds: strings(formData, "required_capability_ids"),
    preferredCapabilityIds: strings(formData, "preferred_capability_ids"),
    requiredVehicleCapabilityIds: strings(
      formData,
      "required_vehicle_capability_ids",
    ),
    preferredVehicleCapabilityIds: strings(
      formData,
      "preferred_vehicle_capability_ids",
    ),
    notes: text(formData.get("notes"), 1000),
  };
}

export async function savePlanningQueueItem(formData: FormData) {
  const redirectTo = safeRedirect(formData.get("redirect_to"));
  const { service, context } = await queueContext();
  const input = queueInputFromForm(formData);
  try {
    if (input.id) {
      await updatePlanningQueueItem(service, context, input);
    } else {
      await createPlanningQueueItem(service, context, input);
    }
  } catch (error) {
    redirect(
      `${redirectTo}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Opslaan mislukt",
      )}`,
    );
  }
  revalidatePath(PAGE);
  redirect(redirectTo);
}

export async function cancelQueueItemAction(formData: FormData) {
  const redirectTo = safeRedirect(formData.get("redirect_to"));
  const id = text(formData.get("queue_item_id"), 80);
  if (!id) redirect(redirectTo);
  const { service, context } = await queueContext();
  try {
    await cancelPlanningQueueItem(
      service,
      context,
      id,
      text(formData.get("reason"), 500),
    );
  } catch (error) {
    redirect(
      `${redirectTo}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Annuleren mislukt",
      )}`,
    );
  }
  revalidatePath(PAGE);
  redirect(redirectTo);
}

export async function suggestQueueItemAction(formData: FormData) {
  const id = text(formData.get("queue_item_id"), 80);
  if (!id) redirect(PAGE);
  const { service, context, branchScope } = await queueContext();
  try {
    await suggestPlanningQueueItem(service, context, branchScope, id);
  } catch (error) {
    redirect(
      `${PAGE}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Suggesties ophalen mislukt",
      )}`,
    );
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?suggest=${encodeURIComponent(id)}`);
}

export async function scheduleQueueItemAction(formData: FormData) {
  const id = text(formData.get("queue_item_id"), 80);
  const instructorId = text(formData.get("instructor_id"), 80);
  const startsRaw = text(formData.get("starts_at"), 40);
  const vehicleId = text(formData.get("vehicle_id"), 80);
  if (!id || !instructorId || !startsRaw) redirect(PAGE);
  const startsAt = new Date(startsRaw);
  if (!Number.isFinite(startsAt.getTime())) {
    redirect(
      `${PAGE}?schedule=${id}&error=${encodeURIComponent("Ongeldige starttijd")}`,
    );
  }
  const { service, context, branchScope } = await queueContext();
  let blockingMessage: string | null = null;
  try {
    const result = await scheduleQueueItem(service, context, branchScope, {
      queueItemId: id,
      instructorId,
      startAt: startsAt,
      vehicleId,
    });
    if (!result.ok) {
      blockingMessage = result.blockingReasons
        .map((reason) => reason.message)
        .join(" · ");
    }
  } catch (error) {
    redirect(
      `${PAGE}?schedule=${id}&error=${encodeURIComponent(
        error instanceof Error ? error.message : "Plannen mislukt",
      )}`,
    );
  }
  if (blockingMessage) {
    redirect(
      `${PAGE}?schedule=${id}&error=${encodeURIComponent(blockingMessage)}`,
    );
  }
  revalidatePath(PAGE);
  revalidatePath("/backoffice/agenda");
  redirect(`${PAGE}?scheduled=${encodeURIComponent(id)}`);
}
