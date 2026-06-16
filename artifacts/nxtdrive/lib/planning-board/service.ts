import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorizedOrganizationContext } from "@/lib/organization";
import type { BranchAccessScope } from "@/lib/permissions";
import { listBranches } from "@/lib/branches/service";
import { loadTenantInstructors } from "@/lib/availability/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import {
  addDaysYmd,
  amsterdamYmd,
  amsterdamWeekdayIndex,
  startOfAmsterdamDayUtc,
} from "@/lib/datetime";
import {
  loadPlanningQueueItems,
  type PlanningQueueListItem,
} from "@/lib/planning-queue";
import type { PlanningReason } from "@/lib/planning-core";
import type {
  PlanningBoardAvailability,
  PlanningBoardData,
  PlanningBoardEvent,
  PlanningBoardFilters,
  PlanningBoardOption,
  PlanningBoardView,
} from "@/lib/planning-board/types";

type EventRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  instructor_id: string;
  student_id?: string | null;
  lead_id?: string | null;
  type?: string | null;
  title?: string | null;
  status?: string | null;
  starts_at: string;
  ends_at: string;
  vehicle_id?: string | null;
  pickup_service_area_id?: string | null;
};

type AvailabilityRuleRow = {
  id: string;
  instructor_id: string;
  weekday: number;
  start_min: number;
  end_min: number;
};

type AvailabilityExceptionRow = {
  id: string;
  instructor_id: string;
  exception_date: string;
  kind: "available" | "blocked";
  start_min: number | null;
  end_min: number | null;
  note: string | null;
};

function cleanYmd(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : amsterdamYmd(new Date());
}

function startOfWeekYmd(value: string): string {
  const weekday = amsterdamWeekdayIndex(startOfAmsterdamDayUtc(value));
  return addDaysYmd(value, -weekday);
}

function rangeFor(
  date: string,
  view: PlanningBoardView,
): { from: Date; to: Date } {
  const anchor = cleanYmd(date);
  const fromYmd = view === "week" ? startOfWeekYmd(anchor) : anchor;
  const toYmd = addDaysYmd(fromYmd, view === "week" ? 7 : 1);
  const from = startOfAmsterdamDayUtc(fromYmd);
  const to = startOfAmsterdamDayUtc(toYmd);
  return { from, to };
}

function daysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let day = amsterdamYmd(from); startOfAmsterdamDayUtc(day) < to; ) {
    days.push(day);
    day = addDaysYmd(day, 1);
  }
  return days;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

async function namesById(
  client: SupabaseClient,
  table: string,
  ids: readonly string[],
  column = "name",
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await client
    .from(table as never)
    .select(`id, ${column}`)
    .in("id", [...ids]);
  const rows = (data ?? []) as unknown as Record<string, string | null>[];
  return new Map(
    rows
      .filter(
        (row): row is Record<string, string> => typeof row.id === "string",
      )
      .map((row) => [row.id, row[column] ?? row.id]),
  );
}

async function loadEvents(
  client: SupabaseClient,
  tenantId: string,
  branchScope: BranchAccessScope,
  filters: PlanningBoardFilters,
  instructorIds: readonly string[],
  from: Date,
  to: Date,
): Promise<PlanningBoardEvent[]> {
  if (instructorIds.length === 0) return [];

  const branchIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  if (branchIds && branchIds.length === 0) return [];

  const applyEventFilters = (query: any, kind: string) => {
    let next = query
      .eq("tenant_id", tenantId)
      .in("instructor_id", [...instructorIds])
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString());
    if (branchIds) next = next.in("branch_id", branchIds);
    if (filters.branchId) next = next.eq("branch_id", filters.branchId);
    if (filters.serviceAreaId) {
      next = next.eq("pickup_service_area_id", filters.serviceAreaId);
    }
    if (filters.vehicleId) next = next.eq("vehicle_id", filters.vehicleId);
    if (
      filters.appointmentType &&
      kind === "agenda_appointment" &&
      filters.appointmentType !== "lesson" &&
      filters.appointmentType !== "trial_lesson"
    ) {
      next = next.eq("type", filters.appointmentType);
    }
    return next.order("starts_at", { ascending: true });
  };

  const [lessons, trials, appointments] = await Promise.all([
    filters.appointmentType && filters.appointmentType !== "lesson"
      ? Promise.resolve({ data: [], error: null })
      : applyEventFilters(
      client
        .from("lessons")
        .select(
          "id, tenant_id, branch_id, instructor_id, student_id, starts_at, ends_at, status, vehicle_id, pickup_service_area_id",
        )
        .eq("status", "planned"),
        "lesson",
      ),
    filters.appointmentType && filters.appointmentType !== "trial_lesson"
      ? Promise.resolve({ data: [], error: null })
      : applyEventFilters(
      client
        .from("trial_lessons")
        .select(
          "id, tenant_id, branch_id, instructor_id, lead_id, starts_at, ends_at, status, vehicle_id, pickup_service_area_id",
        )
        .in("status", ["provisional", "confirmed"]),
        "trial_lesson",
      ),
    filters.appointmentType &&
    (filters.appointmentType === "lesson" ||
      filters.appointmentType === "trial_lesson")
      ? Promise.resolve({ data: [], error: null })
      : applyEventFilters(
      client
        .from("agenda_appointments")
        .select(
          "id, tenant_id, branch_id, instructor_id, student_id, type, title, starts_at, ends_at, status, vehicle_id, pickup_service_area_id",
        )
        .eq("status", "planned"),
        "agenda_appointment",
      ),
  ]);

  for (const result of [lessons, trials, appointments]) {
    if (result.error)
      throw new Error(
        `Planning board events laden mislukt: ${result.error.message}`,
      );
  }

  const lessonRows = (lessons.data ?? []) as EventRow[];
  const trialRows = (trials.data ?? []) as EventRow[];
  const appointmentRows = (appointments.data ?? []) as EventRow[];
  const studentIds = unique([
    ...lessonRows.map((row) => row.student_id),
    ...appointmentRows.map((row) => row.student_id),
  ]);
  const leadIds = unique(trialRows.map((row) => row.lead_id));
  const vehicleIds = unique([
    ...lessonRows.map((row) => row.vehicle_id),
    ...trialRows.map((row) => row.vehicle_id),
    ...appointmentRows.map((row) => row.vehicle_id),
  ]);
  const serviceAreaIds = unique([
    ...lessonRows.map((row) => row.pickup_service_area_id),
    ...trialRows.map((row) => row.pickup_service_area_id),
    ...appointmentRows.map((row) => row.pickup_service_area_id),
  ]);

  const [students, leads, vehicleNames, areaNames] = await Promise.all([
    namesById(client, "students", studentIds, "full_name"),
    namesById(client, "leads", leadIds, "full_name"),
    namesById(client, "vehicles", vehicleIds, "license_plate"),
    namesById(client, "service_areas", serviceAreaIds, "name"),
  ]);

  const mapEvent = (
    row: EventRow,
    entityType: PlanningBoardEvent["entityType"],
  ): PlanningBoardEvent => {
    const target = row.student_id
      ? students.get(row.student_id)
      : row.lead_id
        ? leads.get(row.lead_id)
        : row.title;
    const typeLabel =
      entityType === "lesson"
        ? "Rijles"
        : entityType === "trial_lesson"
          ? "Proefles"
          : (row.type ?? "Afspraak");
    return {
      id: row.id,
      entityType,
      instructorId: row.instructor_id,
      branchId: row.branch_id,
      title: target ?? typeLabel,
      subtitle: typeLabel,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      durationMinutes: Math.round(
        (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) /
          60000,
      ),
      appointmentType: row.type ?? null,
      status: row.status ?? null,
      vehicleId: row.vehicle_id ?? null,
      vehicleLabel: row.vehicle_id
        ? (vehicleNames.get(row.vehicle_id) ?? null)
        : null,
      serviceAreaId: row.pickup_service_area_id ?? null,
      serviceAreaName: row.pickup_service_area_id
        ? (areaNames.get(row.pickup_service_area_id) ?? null)
        : null,
    };
  };

  const events = [
    ...lessonRows.map((row) => mapEvent(row, "lesson")),
    ...trialRows.map((row) => mapEvent(row, "trial_lesson")),
    ...appointmentRows.map((row) => mapEvent(row, "agenda_appointment")),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const withWarnings = addEventConflictWarnings(events);
  return filters.conflictsOnly
    ? withWarnings.filter((event) => (event.warnings?.length ?? 0) > 0)
    : withWarnings;
}

function addEventConflictWarnings(
  events: readonly PlanningBoardEvent[],
): PlanningBoardEvent[] {
  return events.map((event, index) => {
    const warnings: PlanningReason[] = [];
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    const overlaps = events.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      const otherStart = Date.parse(other.startsAt);
      const otherEnd = Date.parse(other.endsAt);
      if (!(start < otherEnd && end > otherStart)) return false;
      return (
        other.instructorId === event.instructorId ||
        (Boolean(event.vehicleId) && other.vehicleId === event.vehicleId)
      );
    });
    if (overlaps) {
      warnings.push({
        code:
          otherConflictType(events, index, event) === "vehicle"
            ? "VEHICLE_HAS_OVERLAP"
            : "INSTRUCTOR_HAS_OVERLAP",
        severity: "warning",
        message: "Deze afspraak overlapt met een andere planning.",
      });
    }
    return warnings.length ? { ...event, warnings } : event;
  });
}

function otherConflictType(
  events: readonly PlanningBoardEvent[],
  index: number,
  event: PlanningBoardEvent,
): "vehicle" | "instructor" {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  for (const [otherIndex, other] of events.entries()) {
    if (index === otherIndex) continue;
    const otherStart = Date.parse(other.startsAt);
    const otherEnd = Date.parse(other.endsAt);
    if (!(start < otherEnd && end > otherStart)) continue;
    if (Boolean(event.vehicleId) && other.vehicleId === event.vehicleId) {
      return "vehicle";
    }
  }
  return "instructor";
}

async function loadAvailabilityBlocks(
  client: SupabaseClient,
  tenantId: string,
  instructorIds: readonly string[],
  from: Date,
  to: Date,
): Promise<PlanningBoardAvailability[]> {
  if (instructorIds.length === 0) return [];
  const [rules, exceptions] = await Promise.all([
    client
      .from("instructor_availability")
      .select("id, instructor_id, weekday, start_min, end_min")
      .eq("tenant_id", tenantId)
      .in("instructor_id", [...instructorIds]),
    client
      .from("instructor_availability_exception")
      .select(
        "id, instructor_id, exception_date, kind, start_min, end_min, note",
      )
      .eq("tenant_id", tenantId)
      .in("instructor_id", [...instructorIds])
      .gte("exception_date", amsterdamYmd(from))
      .lt("exception_date", amsterdamYmd(to)),
  ]);

  const ruleBlocks = ((rules.data ?? []) as AvailabilityRuleRow[]).map(
    (row) => ({
      id: row.id,
      instructorId: row.instructor_id,
      date: null,
      weekday: row.weekday,
      startMinute: row.start_min,
      endMinute: row.end_min,
      kind: "available" as const,
    }),
  );
  const exceptionBlocks = (
    (exceptions.data ?? []) as AvailabilityExceptionRow[]
  )
    .filter((row) => row.start_min !== null && row.end_min !== null)
    .map((row) => ({
      id: row.id,
      instructorId: row.instructor_id,
      date: row.exception_date,
      weekday: null,
      startMinute: row.start_min ?? 0,
      endMinute: row.end_min ?? 0,
      kind: row.kind,
      note: row.note,
    }));

  return [...ruleBlocks, ...exceptionBlocks];
}

export async function loadPlanningBoardData(
  client: SupabaseClient,
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  filters: PlanningBoardFilters,
): Promise<PlanningBoardData> {
  const { from, to } = rangeFor(filters.date, filters.view);
  const branchFilterIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const tenantId = context.organization.id;

  const [
    allBranches,
    instructorsRaw,
    vehiclesRaw,
    serviceAreasRes,
    capabilitiesRes,
  ] = await Promise.all([
    listBranches(client, tenantId, { activeOnly: true }),
    loadTenantInstructors(tenantId, { branchIds: branchFilterIds }),
    loadVehicles(client, tenantId, {
      branchIds: branchFilterIds,
      includeShared: true,
      activeOnly: true,
    }),
    client
      .from("service_areas")
      .select("id, name, branch_id")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name", { ascending: true }),
    client
      .from("capability_definitions")
      .select("id, label, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("label", { ascending: true }),
  ]);

  if (serviceAreasRes.error) throw new Error(serviceAreasRes.error.message);
  if (capabilitiesRes.error) throw new Error(capabilitiesRes.error.message);

  const branches = (
    branchScope.scope_type === "branches"
      ? allBranches.filter((branch) =>
          branchScope.branch_ids.includes(branch.id),
        )
      : allBranches
  ).map((branch) => ({ id: branch.id, label: branch.name }));

  const serviceAreas = (
    (serviceAreasRes.data ?? []) as {
      id: string;
      name: string;
      branch_id: string | null;
    }[]
  )
    .filter(
      (area) =>
        branchScope.scope_type === "all" ||
        !area.branch_id ||
        branchScope.branch_ids.includes(area.branch_id),
    )
    .map((area) => ({ id: area.id, label: area.name }));

  const instructors = instructorsRaw
    .filter(
      (instructor) =>
        !filters.instructorId || instructor.id === filters.instructorId,
    )
    .map((instructor) => ({ id: instructor.id, name: instructor.full_name }));

  const vehicles = vehiclesRaw.map((vehicle) => ({
    id: vehicle.id,
    label: vehicle.license_plate ?? vehicle.label,
  }));

  const queueItems = await loadPlanningQueueItems(
    client,
    context,
    branchScope,
    {
      branchId: filters.branchId,
      appointmentType: filters.appointmentType,
      serviceAreaId: filters.serviceAreaId,
      transmission: filters.transmission,
      status: filters.status ?? "open",
    },
  );
  const filteredQueue = queueItems.filter((item) => {
    if (filters.capabilityId) {
      const hasCapability =
        item.required_capabilities.includes(filters.capabilityId) ||
        item.preferred_capabilities.includes(filters.capabilityId) ||
        item.required_vehicle_capability_ids.includes(filters.capabilityId) ||
        item.preferred_vehicle_capability_ids.includes(filters.capabilityId);
      if (!hasCapability) return false;
    }
    if (filters.conflictsOnly) {
      const validation = item.last_validation as
        | { blockingReasons?: unknown[]; warnings?: unknown[] }
        | null;
      const hasConflict =
        (validation?.blockingReasons?.length ?? 0) > 0 ||
        (validation?.warnings?.length ?? 0) > 0;
      if (!hasConflict) return false;
    }
    return true;
  });

  const instructorIds = instructors.map((instructor) => instructor.id);
  const [events, availability] = await Promise.all([
    loadEvents(client, tenantId, branchScope, filters, instructorIds, from, to),
    loadAvailabilityBlocks(client, tenantId, instructorIds, from, to),
  ]);

  return {
    tenantId,
    filters,
    rangeStart: from.toISOString(),
    rangeEnd: to.toISOString(),
    defaultVehicleId: filters.vehicleId ?? null,
    days: daysBetween(from, to),
    instructors,
    events,
    queueItems: filteredQueue,
    availability,
    branches,
    serviceAreas,
    vehicles,
    capabilities: (
      (capabilitiesRes.data ?? []) as { id: string; label: string }[]
    ).map((capability) => ({ id: capability.id, label: capability.label })),
  };
}
