import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorizedOrganizationContext } from "@/lib/organization";
import type { BranchAccessScope } from "@/lib/permissions";
import {
  AGENDA_APPOINTMENT_TYPES,
  isStudentLinkedType,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";
import { loadTenantInstructors } from "@/lib/availability/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import {
  getPlanningPreview,
  getPlanningSuggestions as rankPlanningSuggestions,
  loadPlanningKernelData,
  type PlanningSuggestion,
  type PlanningValidationResult,
} from "@/lib/planning-core";
import type {
  PlanningQueueItem,
  PlanningQueueListItem,
  PlanningQueueScheduleInput,
  PlanningQueueScheduleResult,
  PlanningQueueUpsertInput,
} from "@/lib/planning-queue/types";
import {
  buildQueueCandidateInput,
  canManagePlanningQueueItem,
  canReadPlanningQueueItem,
  parseStringArray,
  planningActorForQueue,
  queueItemCanBeScheduled,
  scheduledEntityTypeForQueueItem,
  validationToJson,
} from "@/lib/planning-queue/validation";

type QueueFilters = {
  branchId?: string | null;
  appointmentType?: string | null;
  priority?: string | null;
  status?: string | null;
  serviceAreaId?: string | null;
  transmission?: string | null;
};

type QueueRow = Omit<
  PlanningQueueItem,
  | "required_capabilities"
  | "preferred_capabilities"
  | "required_vehicle_capability_ids"
  | "preferred_vehicle_capability_ids"
> & {
  required_capabilities: unknown;
  preferred_capabilities: unknown;
  required_vehicle_capability_ids: unknown;
  preferred_vehicle_capability_ids: unknown;
};

function normalizeQueueItem(row: QueueRow): PlanningQueueItem {
  return {
    ...row,
    required_capabilities: parseStringArray(row.required_capabilities),
    preferred_capabilities: parseStringArray(row.preferred_capabilities),
    required_vehicle_capability_ids: parseStringArray(
      row.required_vehicle_capability_ids,
    ),
    preferred_vehicle_capability_ids: parseStringArray(
      row.preferred_vehicle_capability_ids,
    ),
  };
}

function matchesFilters(
  item: PlanningQueueItem,
  filters: QueueFilters,
): boolean {
  if (filters.branchId && item.branch_id !== filters.branchId) return false;
  if (
    filters.appointmentType &&
    item.appointment_type !== filters.appointmentType
  )
    return false;
  if (filters.priority && item.priority !== filters.priority) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (
    filters.serviceAreaId &&
    item.pickup_service_area_id !== filters.serviceAreaId
  )
    return false;
  if (
    filters.transmission &&
    item.required_transmission !== filters.transmission
  )
    return false;
  return true;
}

function dedupeIds(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export async function loadPlanningQueueItems(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  filters: QueueFilters = {},
): Promise<PlanningQueueListItem[]> {
  const { data, error } = await client
    .from("planning_queue_items")
    .select("*")
    .eq("tenant_id", context.organization.id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(250);
  if (error) throw new Error(`planning queue laden mislukt: ${error.message}`);

  const items = ((data ?? []) as QueueRow[])
    .map(normalizeQueueItem)
    .filter((item) => canReadPlanningQueueItem(context, branchScope, item))
    .filter((item) => matchesFilters(item, filters));

  const studentIds = dedupeIds(items.map((item) => item.student_id));
  const leadIds = dedupeIds(items.map((item) => item.lead_id));
  const areaIds = dedupeIds(items.map((item) => item.pickup_service_area_id));
  const branchIds = dedupeIds(items.map((item) => item.branch_id));
  const instructorIds = dedupeIds(
    items.map((item) => item.preferred_instructor_id),
  );

  const [students, leads, areas, branches, profiles] = await Promise.all([
    studentIds.length
      ? client
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", context.organization.id)
          .in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? client
          .from("leads")
          .select("id, full_name")
          .eq("tenant_id", context.organization.id)
          .in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    areaIds.length
      ? client
          .from("service_areas")
          .select("id, name")
          .eq("tenant_id", context.organization.id)
          .in("id", areaIds)
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? client
          .from("branches")
          .select("id, name")
          .eq("tenant_id", context.organization.id)
          .in("id", branchIds)
      : Promise.resolve({ data: [], error: null }),
    instructorIds.length
      ? client.from("profiles").select("id, full_name").in("id", instructorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [students, leads, areas, branches, profiles]) {
    if (result.error) throw new Error(`planning queue context laden mislukt`);
  }

  const studentNames = new Map(
    ((students.data ?? []) as { id: string; full_name: string | null }[]).map(
      (row) => [row.id, row.full_name ?? "Leerling"],
    ),
  );
  const leadNames = new Map(
    ((leads.data ?? []) as { id: string; full_name: string | null }[]).map(
      (row) => [row.id, row.full_name ?? "Lead"],
    ),
  );
  const areaNames = new Map(
    ((areas.data ?? []) as { id: string; name: string }[]).map((row) => [
      row.id,
      row.name,
    ]),
  );
  const branchNames = new Map(
    ((branches.data ?? []) as { id: string; name: string }[]).map((row) => [
      row.id,
      row.name,
    ]),
  );
  const instructorNames = new Map(
    ((profiles.data ?? []) as { id: string; full_name: string | null }[]).map(
      (row) => [row.id, row.full_name ?? "Instructeur"],
    ),
  );

  return items.map((item) => ({
    ...item,
    student_name: item.student_id
      ? (studentNames.get(item.student_id) ?? null)
      : null,
    lead_name: item.lead_id ? (leadNames.get(item.lead_id) ?? null) : null,
    service_area_name: item.pickup_service_area_id
      ? (areaNames.get(item.pickup_service_area_id) ?? null)
      : null,
    branch_name: item.branch_id
      ? (branchNames.get(item.branch_id) ?? null)
      : null,
    preferred_instructor_name: item.preferred_instructor_id
      ? (instructorNames.get(item.preferred_instructor_id) ?? null)
      : null,
  }));
}

export async function loadPlanningQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  id: string,
): Promise<PlanningQueueItem | null> {
  const { data, error } = await client
    .from("planning_queue_items")
    .select("*")
    .eq("tenant_id", context.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new Error(`planning queue item laden mislukt: ${error.message}`);
  if (!data) return null;
  const item = normalizeQueueItem(data as QueueRow);
  return canReadPlanningQueueItem(context, branchScope, item) ? item : null;
}

export async function createPlanningQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  input: PlanningQueueUpsertInput,
): Promise<string> {
  return upsertPlanningQueueItem(client, context, input);
}

export async function updatePlanningQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  input: PlanningQueueUpsertInput,
): Promise<string> {
  return upsertPlanningQueueItem(client, context, input);
}

async function upsertPlanningQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  input: PlanningQueueUpsertInput,
): Promise<string> {
  const { data, error } = await client.rpc("upsert_planning_queue_item", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_id: input.id ?? null,
    p_branch_id: input.branchId ?? null,
    p_student_id: input.studentId ?? null,
    p_lead_id: input.leadId ?? null,
    p_appointment_type: input.appointmentType,
    p_duration_minutes: input.durationMinutes,
    p_required_transmission: input.requiredTransmission ?? null,
    p_preferred_instructor_id: input.preferredInstructorId ?? null,
    p_pickup_address_id: input.pickupAddressId ?? null,
    p_pickup_service_area_id: input.pickupServiceAreaId ?? null,
    p_desired_date_from: input.desiredDateFrom ?? null,
    p_desired_date_until: input.desiredDateUntil ?? null,
    p_priority: input.priority,
    p_required_capabilities: input.requiredCapabilityIds ?? [],
    p_preferred_capabilities: input.preferredCapabilityIds ?? [],
    p_required_vehicle_capability_ids: input.requiredVehicleCapabilityIds ?? [],
    p_preferred_vehicle_capability_ids:
      input.preferredVehicleCapabilityIds ?? [],
    p_notes: input.notes ?? null,
  });
  if (error || !data) {
    throw new Error(
      `planning queue item opslaan mislukt: ${error?.message ?? "geen id"}`,
    );
  }
  return String(data);
}

export async function cancelPlanningQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  id: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await client.rpc("cancel_planning_queue_item", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_id: id,
    p_reason: reason ?? null,
  });
  if (error)
    throw new Error(`planning queue item annuleren mislukt: ${error.message}`);
}

function dateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function slotDatesForItem(item: PlanningQueueItem): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = item.desired_date_from
    ? new Date(`${item.desired_date_from}T00:00:00`)
    : today;
  const until = item.desired_date_until
    ? new Date(`${item.desired_date_until}T00:00:00`)
    : new Date(today.getTime() + 14 * 86400000);
  const start = from < today ? today : from;
  const slots: Date[] = [];
  for (
    let day = new Date(start);
    day <= until && slots.length < 220;
    day.setDate(day.getDate() + 1)
  ) {
    for (let hour = 8; hour <= 17; hour += 1) {
      for (const minute of [0, 30]) {
        const slot = new Date(
          `${dateYmd(day)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
        );
        if (slot.getTime() > Date.now()) slots.push(slot);
      }
    }
  }
  return slots;
}

async function candidateInstructorIds(
  item: PlanningQueueItem,
): Promise<string[]> {
  if (item.preferred_instructor_id) return [item.preferred_instructor_id];
  const instructors = await loadTenantInstructors(item.tenant_id, {
    branchIds: item.branch_id ? [item.branch_id] : null,
  });
  return instructors.map((instructor) => instructor.id);
}

async function candidateVehicleIds(
  client: SupabaseClient,
  item: PlanningQueueItem,
): Promise<(string | null)[]> {
  const requiresVehicle =
    item.required_vehicle_capability_ids.length > 0 ||
    item.preferred_vehicle_capability_ids.length > 0;
  if (!requiresVehicle) return [null];
  const vehicles = await loadVehicles(client, item.tenant_id, {
    branchIds: item.branch_id ? [item.branch_id] : null,
    includeShared: true,
    activeOnly: true,
  });
  return vehicles.slice(0, 20).map((vehicle) => vehicle.id);
}

export async function getPlanningQueueSuggestions(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  queueItemId: string,
): Promise<PlanningSuggestion[]> {
  const item = await loadPlanningQueueItem(
    client,
    context,
    branchScope,
    queueItemId,
  );
  if (!item || !canManagePlanningQueueItem(context, branchScope, item))
    return [];
  if (!queueItemCanBeScheduled(item)) return [];

  const actor = planningActorForQueue(context, branchScope);
  const instructorIds = await candidateInstructorIds(item);
  const vehicleIds = await candidateVehicleIds(client, item);
  const candidates: {
    input: ReturnType<typeof buildQueueCandidateInput>;
    data: Awaited<ReturnType<typeof loadPlanningKernelData>>;
  }[] = [];

  for (const instructorId of instructorIds.slice(0, 30)) {
    for (const startAt of slotDatesForItem(item)) {
      for (const vehicleId of vehicleIds) {
        const input = buildQueueCandidateInput({
          item,
          actor,
          instructorId,
          startAt,
          vehicleId,
        });
        const data = await loadPlanningKernelData(client, input);
        candidates.push({ input, data });
        if (candidates.length >= 320) break;
      }
      if (candidates.length >= 320) break;
    }
    if (candidates.length >= 320) break;
  }

  return (await rankPlanningSuggestions(candidates))
    .filter((suggestion) => suggestion.validation.allowed)
    .slice(0, 3);
}

export async function suggestPlanningQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  queueItemId: string,
): Promise<PlanningSuggestion[]> {
  const suggestions = await getPlanningQueueSuggestions(
    client,
    context,
    branchScope,
    queueItemId,
  );
  await client.rpc("mark_planning_queue_item_suggested", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_id: queueItemId,
    p_validation: {
      suggestions: suggestions.map((suggestion) => ({
        instructorId: suggestion.candidate.instructorId,
        vehicleId: suggestion.candidate.vehicleId,
        startAt: suggestion.candidate.startAt,
        score: suggestion.score,
        warnings: suggestion.warnings,
      })),
    },
  });
  return suggestions;
}

function validationErrorResult(
  validation: PlanningValidationResult,
): PlanningQueueScheduleResult {
  return {
    ok: false,
    validation,
    blockingReasons: validation.blockingReasons,
  };
}

export async function scheduleQueueItem(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  input: PlanningQueueScheduleInput,
): Promise<PlanningQueueScheduleResult> {
  const item = await loadPlanningQueueItem(
    client,
    context,
    branchScope,
    input.queueItemId,
  );
  if (!item || !canManagePlanningQueueItem(context, branchScope, item)) {
    throw new Error("Geen toegang tot dit planning queue item.");
  }
  if (!queueItemCanBeScheduled(item)) {
    throw new Error("Dit planning queue item kan niet meer gepland worden.");
  }

  const actor = planningActorForQueue(context, branchScope);
  const candidate = buildQueueCandidateInput({
    item,
    actor,
    instructorId: input.instructorId,
    startAt: input.startAt,
    vehicleId: input.vehicleId ?? null,
  });
  const kernelData = await loadPlanningKernelData(client, candidate);
  const validation = await getPlanningPreview(candidate, kernelData);
  if (!validation.allowed) return validationErrorResult(validation);

  const entityType = scheduledEntityTypeForQueueItem(item);
  const notes = item.notes ? `Planning queue: ${item.notes}` : "Planning queue";
  let entityId: string | null = null;

  if (entityType === "lesson") {
    if (!item.student_id) throw new Error("Les queue item mist een leerling.");
    const { data, error } = await client.rpc("schedule_lesson", {
      p_tenant_id: item.tenant_id,
      p_actor: context.user.id,
      p_instructor_id: input.instructorId,
      p_student_id: item.student_id,
      p_starts_at: input.startAt.toISOString(),
      p_duration_min: item.duration_minutes,
      p_location: item.pickup_address_id,
      p_notes: notes,
      p_location_lat: null,
      p_location_lng: null,
      p_location_place_id: null,
    });
    if (error || !data)
      throw new Error(`Les plannen mislukt: ${error?.message ?? "geen id"}`);
    entityId = String(data);
  } else if (entityType === "trial_lesson") {
    if (!item.lead_id) throw new Error("Proefles queue item mist een lead.");
    if (![60, 90, 120].includes(item.duration_minutes)) {
      throw new Error(
        "Proeflessen kunnen alleen met 60, 90 of 120 minuten worden gepland.",
      );
    }
    const { error } = await client.rpc("book_trial_lesson", {
      p_lead_id: item.lead_id,
      p_tenant_id: item.tenant_id,
      p_instructor_id: input.instructorId,
      p_starts_at: input.startAt.toISOString(),
      p_duration_min: item.duration_minutes,
      p_pickup_location: item.pickup_address_id,
      p_score: 0,
      p_reason: "Planning queue",
    });
    if (error) throw new Error(`Proefles plannen mislukt: ${error.message}`);
    const { data: trial } = await client
      .from("trial_lessons")
      .select("id")
      .eq("tenant_id", item.tenant_id)
      .eq("lead_id", item.lead_id)
      .eq("instructor_id", input.instructorId)
      .eq("starts_at", input.startAt.toISOString())
      .maybeSingle();
    entityId = (trial as { id?: string } | null)?.id ?? item.id;
  } else {
    const appointmentType = item.appointment_type as AgendaAppointmentType;
    if (
      !(AGENDA_APPOINTMENT_TYPES as readonly string[]).includes(appointmentType)
    ) {
      throw new Error(`Onbekend afspraaktype: ${item.appointment_type}`);
    }
    const { data, error } = await client.rpc("create_agenda_appointment", {
      p_tenant_id: item.tenant_id,
      p_actor: context.user.id,
      p_instructor_id: input.instructorId,
      p_type: appointmentType,
      p_starts_at: input.startAt.toISOString(),
      p_duration_min: item.duration_minutes,
      p_student_id: isStudentLinkedType(appointmentType)
        ? item.student_id
        : null,
      p_branch_id: item.branch_id,
      p_title: item.lead_id ? "Planbare lead-afspraak" : "Planbare afspraak",
      p_location: item.pickup_address_id,
      p_notes: notes,
      p_vehicle_id: input.vehicleId ?? null,
      p_pickup_service_area_id: item.pickup_service_area_id,
    });
    if (error || !data) {
      throw new Error(
        `Afspraak plannen mislukt: ${error?.message ?? "geen id"}`,
      );
    }
    entityId = String(data);
  }

  const { error: markError } = await client.rpc(
    "mark_planning_queue_item_scheduled",
    {
      p_tenant_id: item.tenant_id,
      p_actor: context.user.id,
      p_id: item.id,
      p_scheduled_entity_type: entityType,
      p_scheduled_entity_id: entityId,
      p_validation: validationToJson(validation),
    },
  );
  if (markError) {
    throw new Error(`Queue afronden mislukt: ${markError.message}`);
  }

  return { ok: true, entityType, entityId, validation };
}
