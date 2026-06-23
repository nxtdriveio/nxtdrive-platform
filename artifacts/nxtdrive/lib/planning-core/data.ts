import type { SupabaseClient } from "@supabase/supabase-js";

import { amsterdamYmd } from "@/lib/datetime";
import type {
  PlanningBusyInterval,
  PlanningCandidateInput,
  PlanningKernelData,
  PlanningSettings,
  PlanningTravelMatrixEntry,
  PlanningVehicleData,
} from "@/lib/planning-core/types";

type IdRow = { id: string };

type AvailabilityRuleRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  instructor_id: string;
  weekday: number;
  start_min: number;
  end_min: number;
  created_at: string;
  updated_at: string;
};

type AvailabilityExceptionRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  instructor_id: string;
  exception_date: string;
  kind: "available" | "blocked";
  start_min: number | null;
  end_min: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type VehicleRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  transmission: "schakel" | "automaat" | null;
  status: PlanningVehicleData["status"] | null;
  apk_expires_at: string | null;
  current_odometer_km: number | null;
};

type BusyRow = {
  id: string;
  instructor_id: string | null;
  vehicle_id?: string | null;
  starts_at: string;
  ends_at: string;
  pickup_service_area_id?: string | null;
  status?: string | null;
};

type PlanningSettingsRow = {
  rayon_policy: PlanningSettings["rayonPolicy"] | null;
  default_travel_buffer_minutes: number | null;
  same_area_travel_minutes: number | null;
  different_area_travel_minutes: number | null;
};

function uniq(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export function isActivePlanningBusyStatus(
  status: string | null | undefined,
): boolean {
  return ![
    "completed",
    "cancelled",
    "cancelled_with_refund",
    "cancelled_no_refund",
    "no_show",
    "archived",
  ].includes(status ?? "");
}

function activeBusy(row: BusyRow): boolean {
  return isActivePlanningBusyStatus(row.status);
}

function busyInterval(
  entityType: PlanningBusyInterval["entityType"],
  row: BusyRow,
): PlanningBusyInterval {
  return {
    id: row.id,
    entityType,
    instructorId: row.instructor_id,
    vehicleId: row.vehicle_id ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceAreaId: row.pickup_service_area_id ?? null,
  };
}

async function selectIds(
  client: SupabaseClient,
  table: string,
  column: string,
  filters: (query: any) => any,
): Promise<string[]> {
  const { data } = await filters(client.from(table).select(column));
  return uniq(
    ((data ?? []) as Record<string, string | null>[]).map((row) => row[column]),
  );
}

async function loadVehicleData(
  client: SupabaseClient,
  input: PlanningCandidateInput,
  start: Date,
  end: Date,
): Promise<PlanningVehicleData | null> {
  if (!input.vehicleId) return null;

  const { data: vehicleRaw } = await client
    .from("vehicles")
    .select(
      "id, tenant_id, branch_id, transmission, status, apk_expires_at, current_odometer_km",
    )
    .eq("id", input.vehicleId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  const vehicle = vehicleRaw as VehicleRow | null;
  if (!vehicle) return null;

  const upcomingMaintenanceCutoff = new Date(end.getTime() + 30 * 86400000);
  const [
    capabilityIds,
    blockingDamageRows,
    nonBlockingDamageRows,
    blockingMaintenanceRows,
    upcomingMaintenanceRows,
    odometerRows,
  ] = await Promise.all([
    selectIds(client, "vehicle_capabilities", "capability_id", (query) =>
      query.eq("vehicle_id", input.vehicleId).eq("tenant_id", input.tenantId),
    ),
    client
      .from("vehicle_damage_reports")
      .select("id")
      .eq("vehicle_id", input.vehicleId)
      .eq("tenant_id", input.tenantId)
      .eq("blocks_planning", true)
      .in("status", ["open", "in_review"]),
    client
      .from("vehicle_damage_reports")
      .select("id")
      .eq("vehicle_id", input.vehicleId)
      .eq("tenant_id", input.tenantId)
      .eq("blocks_planning", false)
      .in("status", ["open", "in_review"]),
    client
      .from("vehicle_maintenance_events")
      .select("id, starts_at, ends_at")
      .eq("vehicle_id", input.vehicleId)
      .eq("tenant_id", input.tenantId)
      .eq("blocks_planning", true)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    client
      .from("vehicle_maintenance_events")
      .select("id, starts_at, ends_at")
      .eq("vehicle_id", input.vehicleId)
      .eq("tenant_id", input.tenantId)
      .eq("status", "planned")
      .gte("starts_at", end.toISOString())
      .lte("starts_at", upcomingMaintenanceCutoff.toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
    client
      .from("vehicle_odometer_entries")
      .select("recorded_at")
      .eq("vehicle_id", input.vehicleId)
      .eq("tenant_id", input.tenantId)
      .order("recorded_at", { ascending: false })
      .limit(1),
  ]);

  return {
    id: vehicle.id,
    tenantId: vehicle.tenant_id,
    branchId: vehicle.branch_id,
    transmission: vehicle.transmission,
    status: vehicle.status,
    apkExpiresAt: vehicle.apk_expires_at,
    currentOdometerKm: vehicle.current_odometer_km,
    capabilityIds,
    hasBlockingDamage: ((blockingDamageRows.data ?? []) as IdRow[]).length > 0,
    nonBlockingDamageCount: ((nonBlockingDamageRows.data ?? []) as IdRow[])
      .length,
    blockingMaintenanceIntervals: (
      (blockingMaintenanceRows.data ?? []) as {
        id: string;
        starts_at: string;
        ends_at: string;
      }[]
    ).map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
    upcomingMaintenanceIntervals: (
      (upcomingMaintenanceRows.data ?? []) as {
        id: string;
        starts_at: string;
        ends_at: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
    latestOdometerRecordedAt:
      ((odometerRows.data ?? []) as { recorded_at: string }[])[0]
        ?.recorded_at ?? null,
  };
}

async function loadBusyIntervals(
  client: SupabaseClient,
  input: PlanningCandidateInput,
  start: Date,
  end: Date,
): Promise<PlanningBusyInterval[]> {
  const [lessons, trials, appointments] = await Promise.all([
    client
      .from("lessons")
      .select(
        "id, instructor_id, vehicle_id, starts_at, ends_at, pickup_service_area_id, status",
      )
      .eq("tenant_id", input.tenantId)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    client
      .from("trial_lessons")
      .select(
        "id, instructor_id, vehicle_id, starts_at, ends_at, pickup_service_area_id, status",
      )
      .eq("tenant_id", input.tenantId)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
    client
      .from("agenda_appointments")
      .select(
        "id, instructor_id, vehicle_id, starts_at, ends_at, pickup_service_area_id, status",
      )
      .eq("tenant_id", input.tenantId)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
  ]);

  return [
    ...((lessons.data ?? []) as BusyRow[])
      .filter(activeBusy)
      .map((row) => busyInterval("lesson", row)),
    ...((trials.data ?? []) as BusyRow[])
      .filter(activeBusy)
      .map((row) => busyInterval("trial_lesson", row)),
    ...((appointments.data ?? []) as BusyRow[])
      .filter(activeBusy)
      .map((row) => busyInterval("agenda_appointment", row)),
  ];
}

export async function loadPlanningKernelData(
  client: SupabaseClient,
  input: PlanningCandidateInput,
): Promise<PlanningKernelData> {
  const start =
    input.startAt instanceof Date ? input.startAt : new Date(input.startAt);
  const end = input.endAt instanceof Date ? input.endAt : new Date(input.endAt);
  const fromYmd = amsterdamYmd(start);
  const toYmd = amsterdamYmd(end);

  const [
    rules,
    exceptions,
    instructorCapabilities,
    instructorServiceAreas,
    branchMemberships,
    vehicle,
    busyIntervals,
    travelRows,
    settingsRows,
    studentRequiredCapabilityIds,
    studentPreferredCapabilityIds,
  ] = await Promise.all([
    client
      .from("instructor_availability")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("instructor_id", input.instructorId),
    client
      .from("instructor_availability_exception")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("instructor_id", input.instructorId)
      .gte("exception_date", fromYmd)
      .lte("exception_date", toYmd),
    selectIds(client, "instructor_capabilities", "capability_id", (query) =>
      query
        .eq("tenant_id", input.tenantId)
        .eq("instructor_id", input.instructorId),
    ),
    selectIds(
      client,
      "instructor_service_area_assignments",
      "service_area_id",
      (query) =>
        query
          .eq("tenant_id", input.tenantId)
          .eq("instructor_id", input.instructorId),
    ),
    client
      .from("memberships")
      .select("membership_branches(branch_id)")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.instructorId),
    loadVehicleData(client, input, start, end),
    loadBusyIntervals(client, input, start, end),
    client
      .from("service_area_travel_matrix")
      .select("from_service_area_id, to_service_area_id, estimated_minutes")
      .eq("tenant_id", input.tenantId),
    client
      .from("planning_settings")
      .select(
        "rayon_policy, default_travel_buffer_minutes, same_area_travel_minutes, different_area_travel_minutes",
      )
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
    input.studentId
      ? selectIds(client, "student_requirements", "capability_id", (query) =>
          query
            .eq("tenant_id", input.tenantId)
            .eq("student_id", input.studentId)
            .eq("requirement_type", "required"),
        )
      : Promise.resolve([]),
    input.studentId
      ? selectIds(client, "student_requirements", "capability_id", (query) =>
          query
            .eq("tenant_id", input.tenantId)
            .eq("student_id", input.studentId)
            .eq("requirement_type", "preferred"),
        )
      : Promise.resolve([]),
  ]);

  const branchIds = uniq(
    (
      (branchMemberships.data ?? []) as {
        membership_branches?: { branch_id: string }[];
      }[]
    )
      .flatMap((row) => row.membership_branches ?? [])
      .map((row) => row.branch_id),
  );

  return {
    instructor: {
      id: input.instructorId,
      tenantId: input.tenantId,
      branchIds,
      capabilityIds: instructorCapabilities,
      serviceAreaIds: instructorServiceAreas,
      availabilityRules: (rules.data ?? []) as AvailabilityRuleRow[],
      availabilityExceptions: (exceptions.data ??
        []) as AvailabilityExceptionRow[],
    },
    vehicle,
    requirements: {
      requiredInstructorCapabilityIds: studentRequiredCapabilityIds,
      preferredInstructorCapabilityIds: studentPreferredCapabilityIds,
    },
    busyIntervals,
    serviceAreaTravelMatrix: (
      (travelRows.data ?? []) as {
        from_service_area_id: string;
        to_service_area_id: string;
        estimated_minutes: number;
      }[]
    ).map<PlanningTravelMatrixEntry>((row) => ({
      fromServiceAreaId: row.from_service_area_id,
      toServiceAreaId: row.to_service_area_id,
      estimatedMinutes: row.estimated_minutes,
    })),
    settings: (() => {
      const row = settingsRows.data as PlanningSettingsRow | null;
      return {
        rayonPolicy: row?.rayon_policy ?? undefined,
        defaultTravelBufferMinutes:
          row?.default_travel_buffer_minutes ?? undefined,
        sameAreaTravelMinutes: row?.same_area_travel_minutes ?? undefined,
        differentAreaTravelMinutes:
          row?.different_area_travel_minutes ?? undefined,
      };
    })(),
  };
}
