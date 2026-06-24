import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  PlanningActorAccess,
  PlanningCandidateInput,
  PlanningKernelData,
} from "@/lib/planning-core/types";
import { isActivePlanningBusyStatus } from "@/lib/planning-core/data";
import { formatPlanningReason } from "@/lib/planning-core/reasons";
import { validateScheduleCandidate } from "@/lib/planning-core/validation";

const actor: PlanningActorAccess = {
  userId: "planner-1",
  roles: ["planner"],
  tenantIds: ["tenant-1"],
};

function candidate(
  overrides: Partial<PlanningCandidateInput> = {},
): PlanningCandidateInput {
  return {
    actor,
    scope: { type: "tenant", tenantId: "tenant-1" },
    entityType: "lesson",
    tenantId: "tenant-1",
    instructorId: "instructor-1",
    startAt: "2026-06-15T08:00:00.000Z",
    endAt: "2026-06-15T09:00:00.000Z",
    pickupServiceAreaId: "area-a",
    ...overrides,
  };
}

function data(overrides: Partial<PlanningKernelData> = {}): PlanningKernelData {
  return {
    instructor: {
      id: "instructor-1",
      tenantId: "tenant-1",
      serviceAreaIds: ["area-a"],
      capabilityIds: ["manual", "anxiety"],
      availabilityRules: [
        {
          id: "rule-1",
          tenant_id: "tenant-1",
          branch_id: null,
          instructor_id: "instructor-1",
          weekday: 1,
          start_min: 540,
          end_min: 1080,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      availabilityExceptions: [],
    },
    busyIntervals: [],
    serviceAreaTravelMatrix: [],
    settings: {
      rayonPolicy: "hard_block",
      sameAreaTravelMinutes: 10,
      differentAreaTravelMinutes: 30,
      defaultTravelBufferMinutes: 15,
    },
    ...overrides,
  };
}

function codes(result: ReturnType<typeof validateScheduleCandidate>): string[] {
  return result.blockingReasons.map((item) => item.code);
}

function warningCodes(
  result: ReturnType<typeof validateScheduleCandidate>,
): string[] {
  return result.warnings.map((item) => item.code);
}

describe("validateScheduleCandidate", () => {
  it("allows a valid appointment inside availability", () => {
    const result = validateScheduleCandidate(candidate(), data());

    assert.equal(result.allowed, true);
    assert.deepEqual(result.blockingReasons, []);
  });

  it("blocks actors outside the requested scope", () => {
    const result = validateScheduleCandidate(
      candidate({
        actor: { userId: "other", roles: ["planner"], tenantIds: ["tenant-2"] },
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("ACTOR_NOT_ALLOWED_FOR_SCOPE"));
  });

  it("blocks appointments outside instructor availability", () => {
    const result = validateScheduleCandidate(
      candidate({
        startAt: "2026-06-15T18:00:00.000Z",
        endAt: "2026-06-15T19:00:00.000Z",
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSTRUCTOR_NOT_AVAILABLE"));
  });

  it("keeps branch-specific availability inside its branch", () => {
    const result = validateScheduleCandidate(
      candidate({
        branchId: "branch-a",
        scope: { type: "branch", tenantId: "tenant-1", branchId: "branch-a" },
      }),
      data({
        instructor: {
          id: "instructor-1",
          tenantId: "tenant-1",
          branchIds: ["branch-a", "branch-b"],
          serviceAreaIds: ["area-a"],
          capabilityIds: ["manual", "anxiety"],
          availabilityRules: [
            {
              id: "rule-branch-b",
              tenant_id: "tenant-1",
              branch_id: "branch-b",
              instructor_id: "instructor-1",
              weekday: 1,
              start_min: 540,
              end_min: 1080,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          availabilityExceptions: [],
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSTRUCTOR_NOT_AVAILABLE"));
  });

  it("blocks instructor overlaps", () => {
    const result = validateScheduleCandidate(
      candidate(),
      data({
        busyIntervals: [
          {
            id: "busy-1",
            entityType: "agenda_appointment",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T08:30:00.000Z",
            endsAt: "2026-06-15T09:30:00.000Z",
          },
        ],
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSTRUCTOR_HAS_OVERLAP"));
  });

  it("blocks missing required instructor capabilities", () => {
    const result = validateScheduleCandidate(
      candidate({ requiredInstructorCapabilityIds: ["manual", "ris"] }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("MISSING_REQUIRED_CAPABILITY"));
  });

  it("blocks missing student requirement capabilities", () => {
    const result = validateScheduleCandidate(
      candidate(),
      data({
        requirements: { requiredInstructorCapabilityIds: ["adhd_coaching"] },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("MISSING_REQUIRED_CAPABILITY"));
  });

  it("warns for preferred capability mismatch without blocking", () => {
    const result = validateScheduleCandidate(
      candidate({ preferredInstructorCapabilityIds: ["english"] }),
      data(),
    );

    assert.equal(result.allowed, true);
    assert.ok(warningCodes(result).includes("PREFERRED_CAPABILITY_MISSING"));
  });

  it("warns for outside rayon when policy is warning_only", () => {
    const result = validateScheduleCandidate(
      candidate({ pickupServiceAreaId: "area-b" }),
      data({ settings: { rayonPolicy: "warning_only" } }),
    );

    assert.equal(result.allowed, true);
    assert.equal(result.warnings[0]?.code, "OUTSIDE_INSTRUCTOR_SERVICE_AREA");
  });

  it("blocks outside rayon when policy is hard_block", () => {
    const result = validateScheduleCandidate(
      candidate({ pickupServiceAreaId: "area-b" }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("OUTSIDE_INSTRUCTOR_SERVICE_AREA"));
  });

  it("ignores outside rayon when policy is ignore", () => {
    const result = validateScheduleCandidate(
      candidate({ pickupServiceAreaId: "area-b" }),
      data({ settings: { rayonPolicy: "ignore" } }),
    );

    assert.equal(result.allowed, true);
    assert.ok(!codes(result).includes("OUTSIDE_INSTRUCTOR_SERVICE_AREA"));
    assert.ok(
      !warningCodes(result).includes("OUTSIDE_INSTRUCTOR_SERVICE_AREA"),
    );
  });

  it("allows active vehicles", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          apkExpiresAt: "2026-12-01",
          latestOdometerRecordedAt: "2026-06-14T10:00:00.000Z",
        },
      }),
    );

    assert.equal(result.allowed, true);
    assert.deepEqual(result.blockingReasons, []);
  });

  it("blocks maintenance vehicles", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "maintenance",
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_UNAVAILABLE"));
  });

  it("blocks expired APK", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          apkExpiresAt: "2026-06-01",
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_APK_EXPIRED"));
  });

  it("blocks blocking damage", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          hasBlockingDamage: true,
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_HAS_BLOCKING_DAMAGE"));
  });

  it("blocks overlapping blocking maintenance", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          blockingMaintenanceIntervals: [
            {
              id: "maintenance-1",
              startsAt: "2026-06-15T07:30:00.000Z",
              endsAt: "2026-06-15T08:30:00.000Z",
            },
          ],
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_MAINTENANCE_BLOCK"));
  });

  it("blocks overlapping vehicle appointments", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
        },
        busyIntervals: [
          {
            id: "vehicle-busy-1",
            entityType: "lesson",
            vehicleId: "vehicle-1",
            startsAt: "2026-06-15T08:15:00.000Z",
            endsAt: "2026-06-15T08:45:00.000Z",
          },
        ],
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_HAS_OVERLAP"));
  });

  it("blocks transmission mismatch", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1", requiredTransmission: "automatic" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          transmission: "schakel",
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_TRANSMISSION_MISMATCH"));
  });

  it("blocks missing required vehicle capabilities", () => {
    const result = validateScheduleCandidate(
      candidate({
        vehicleId: "vehicle-1",
        requiredVehicleCapabilityIds: ["dual_controls"],
      }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          capabilityIds: ["automatic"],
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("MISSING_REQUIRED_VEHICLE_CAPABILITY"));
  });

  it("blocks required vehicle capabilities without a selected vehicle", () => {
    const result = validateScheduleCandidate(
      candidate({
        requiredVehicleCapabilityIds: ["dual_controls"],
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("MISSING_REQUIRED_VEHICLE_CAPABILITY"));
  });

  it("blocks branch mismatch", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1", branchId: "branch-a" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          branchId: "branch-b",
          status: "active",
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_OUTSIDE_BRANCH_SCOPE"));
  });

  it("warns for non-blocking damage", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          status: "active",
          nonBlockingDamageCount: 1,
          latestOdometerRecordedAt: "2026-06-14T10:00:00.000Z",
        },
      }),
    );

    assert.equal(result.allowed, true);
    assert.ok(warningCodes(result).includes("VEHICLE_HAS_NON_BLOCKING_DAMAGE"));
  });

  it("blocks insufficient travel time before and after", () => {
    const result = validateScheduleCandidate(
      candidate(),
      data({
        busyIntervals: [
          {
            id: "prev",
            entityType: "lesson",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T06:00:00.000Z",
            endsAt: "2026-06-15T07:45:00.000Z",
            serviceAreaId: "area-b",
          },
          {
            id: "next",
            entityType: "lesson",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T09:10:00.000Z",
            endsAt: "2026-06-15T10:00:00.000Z",
            serviceAreaId: "area-b",
          },
        ],
        serviceAreaTravelMatrix: [
          {
            fromServiceAreaId: "area-b",
            toServiceAreaId: "area-a",
            estimatedMinutes: 30,
          },
          {
            fromServiceAreaId: "area-a",
            toServiceAreaId: "area-b",
            estimatedMinutes: 30,
          },
        ],
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSUFFICIENT_TRAVEL_TIME_BEFORE"));
    assert.ok(codes(result).includes("INSUFFICIENT_TRAVEL_TIME_AFTER"));
  });

  it("uses same-area travel buffer", () => {
    const result = validateScheduleCandidate(
      candidate(),
      data({
        busyIntervals: [
          {
            id: "prev",
            entityType: "lesson",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T06:00:00.000Z",
            endsAt: "2026-06-15T07:55:00.000Z",
            serviceAreaId: "area-a",
          },
        ],
        settings: { sameAreaTravelMinutes: 10 },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSUFFICIENT_TRAVEL_TIME_BEFORE"));
  });

  it("uses different-area fallback travel buffer", () => {
    const result = validateScheduleCandidate(
      candidate(),
      data({
        busyIntervals: [
          {
            id: "prev",
            entityType: "lesson",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T06:00:00.000Z",
            endsAt: "2026-06-15T07:35:00.000Z",
            serviceAreaId: "area-b",
          },
        ],
        settings: { differentAreaTravelMinutes: 30 },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSUFFICIENT_TRAVEL_TIME_BEFORE"));
    assert.ok(
      warningCodes(result).includes("UNKNOWN_SERVICE_AREA_TRAVEL_TIME"),
    );
  });

  it("uses travel matrix override", () => {
    const result = validateScheduleCandidate(
      candidate(),
      data({
        busyIntervals: [
          {
            id: "prev",
            entityType: "lesson",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T06:00:00.000Z",
            endsAt: "2026-06-15T07:35:00.000Z",
            serviceAreaId: "area-b",
          },
        ],
        serviceAreaTravelMatrix: [
          {
            fromServiceAreaId: "area-b",
            toServiceAreaId: "area-a",
            estimatedMinutes: 20,
          },
        ],
      }),
    );

    assert.equal(result.allowed, true);
    assert.ok(!codes(result).includes("INSUFFICIENT_TRAVEL_TIME_BEFORE"));
    assert.ok(
      !warningCodes(result).includes("UNKNOWN_SERVICE_AREA_TRAVEL_TIME"),
    );
  });

  it("blocks branch-scoped actors outside their branch", () => {
    const result = validateScheduleCandidate(
      candidate({
        actor: {
          userId: "branch-planner",
          roles: ["planner"],
          branchAccess: [{ tenantId: "tenant-1", branchIds: ["branch-a"] }],
        },
        scope: { type: "branch", tenantId: "tenant-1", branchId: "branch-b" },
        branchId: "branch-b",
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("ACTOR_NOT_ALLOWED_FOR_SCOPE"));
  });

  it("allows branch-scoped actors inside their own branch", () => {
    const result = validateScheduleCandidate(
      candidate({
        actor: {
          userId: "branch-planner",
          roles: ["planner"],
          branchAccess: [{ tenantId: "tenant-1", branchIds: ["branch-a"] }],
        },
        scope: { type: "branch", tenantId: "tenant-1", branchId: "branch-a" },
        branchId: "branch-a",
      }),
      data({
        instructor: {
          id: "instructor-1",
          tenantId: "tenant-1",
          branchIds: ["branch-a"],
          serviceAreaIds: ["area-a"],
          capabilityIds: ["manual", "anxiety"],
          availabilityRules: [
            {
              id: "rule-branch-a",
              tenant_id: "tenant-1",
              branch_id: "branch-a",
              instructor_id: "instructor-1",
              weekday: 1,
              start_min: 540,
              end_min: 1080,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          availabilityExceptions: [],
        },
      }),
    );

    assert.equal(result.allowed, true);
    assert.deepEqual(result.blockingReasons, []);
  });

  it("blocks franchise planning actors without manage permission", () => {
    const result = validateScheduleCandidate(
      candidate({
        actor: {
          userId: "franchise-viewer",
          roles: ["franchise_admin"],
          franchiseOperations: [
            {
              franchiseRootTenantId: "root-1",
              franchiseeTenantId: "tenant-1",
              canViewPlanning: true,
              canManagePlanning: false,
            },
          ],
        },
        scope: {
          type: "franchisee",
          franchiseRootTenantId: "root-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
        },
        branchId: "branch-a",
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("ACTOR_NOT_ALLOWED_FOR_SCOPE"));
  });

  it("allows franchise planning actors with manage permission", () => {
    const result = validateScheduleCandidate(
      candidate({
        actor: {
          userId: "franchise-planner",
          roles: ["franchise_admin"],
          franchiseOperations: [
            {
              franchiseRootTenantId: "root-1",
              franchiseeTenantId: "tenant-1",
              canViewPlanning: true,
              canManagePlanning: true,
            },
          ],
        },
        scope: {
          type: "franchisee",
          franchiseRootTenantId: "root-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
        },
        branchId: "branch-a",
      }),
      data(),
    );

    assert.equal(result.allowed, true);
  });

  it("blocks concurrent vehicle use across instructors", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
          status: "active",
          latestOdometerRecordedAt: "2026-06-14T10:00:00.000Z",
        },
        busyIntervals: [
          {
            id: "vehicle-race",
            entityType: "lesson",
            instructorId: "other-instructor",
            vehicleId: "vehicle-1",
            startsAt: "2026-06-15T08:30:00.000Z",
            endsAt: "2026-06-15T09:30:00.000Z",
          },
        ],
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("VEHICLE_HAS_OVERLAP"));
  });

  it("does not treat adjacent vehicle slots as overlapping", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
          status: "active",
          latestOdometerRecordedAt: "2026-06-14T10:00:00.000Z",
        },
        busyIntervals: [
          {
            id: "previous-vehicle",
            entityType: "lesson",
            vehicleId: "vehicle-1",
            startsAt: "2026-06-15T07:00:00.000Z",
            endsAt: "2026-06-15T08:00:00.000Z",
          },
          {
            id: "next-vehicle",
            entityType: "lesson",
            vehicleId: "vehicle-1",
            startsAt: "2026-06-15T09:00:00.000Z",
            endsAt: "2026-06-15T10:00:00.000Z",
          },
        ],
      }),
    );

    assert.equal(result.allowed, true);
    assert.ok(!codes(result).includes("VEHICLE_HAS_OVERLAP"));
  });

  it("treats only active source rows as busy for planning conflicts", () => {
    for (const status of [
      "completed",
      "cancelled",
      "cancelled_with_refund",
      "cancelled_no_refund",
      "no_show",
      "archived",
    ]) {
      assert.equal(isActivePlanningBusyStatus(status), false, status);
    }

    assert.equal(isActivePlanningBusyStatus("planned"), true);
    assert.equal(isActivePlanningBusyStatus("in_progress"), true);
    assert.equal(isActivePlanningBusyStatus(null), true);
  });

  it("explains a busy-day conflict with availability, vehicle, rayon and capability reasons", () => {
    const result = validateScheduleCandidate(
      candidate({
        branchId: "branch-a",
        scope: { type: "branch", tenantId: "tenant-1", branchId: "branch-a" },
        vehicleId: "vehicle-1",
        pickupServiceAreaId: "area-c",
        requiredInstructorCapabilityIds: ["exam_begeleiding"],
        requiredVehicleCapabilityIds: ["dual_controls"],
        startAt: "2026-06-15T15:30:00.000Z",
        endAt: "2026-06-15T16:30:00.000Z",
      }),
      data({
        instructor: {
          id: "instructor-1",
          tenantId: "tenant-1",
          branchIds: ["branch-a"],
          serviceAreaIds: ["area-a"],
          capabilityIds: ["manual"],
          availabilityRules: [
            {
              id: "morning-only",
              tenant_id: "tenant-1",
              branch_id: "branch-a",
              instructor_id: "instructor-1",
              weekday: 1,
              start_min: 540,
              end_min: 720,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          availabilityExceptions: [],
        },
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
          status: "active",
          transmission: "schakel",
          capabilityIds: ["manual"],
          latestOdometerRecordedAt: "2026-06-14T10:00:00.000Z",
        },
        busyIntervals: [
          {
            id: "exam-same-instructor",
            entityType: "agenda_appointment",
            instructorId: "instructor-1",
            vehicleId: "vehicle-2",
            startsAt: "2026-06-15T15:45:00.000Z",
            endsAt: "2026-06-15T16:45:00.000Z",
            serviceAreaId: "area-a",
          },
          {
            id: "trial-same-vehicle",
            entityType: "trial_lesson",
            instructorId: "instructor-2",
            vehicleId: "vehicle-1",
            startsAt: "2026-06-15T15:15:00.000Z",
            endsAt: "2026-06-15T16:15:00.000Z",
            serviceAreaId: "area-b",
          },
        ],
        settings: { rayonPolicy: "hard_block" },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSTRUCTOR_NOT_AVAILABLE"));
    assert.ok(codes(result).includes("INSTRUCTOR_HAS_OVERLAP"));
    assert.ok(codes(result).includes("VEHICLE_HAS_OVERLAP"));
    assert.ok(codes(result).includes("OUTSIDE_INSTRUCTOR_SERVICE_AREA"));
    assert.ok(codes(result).includes("MISSING_REQUIRED_CAPABILITY"));
    assert.ok(codes(result).includes("MISSING_REQUIRED_VEHICLE_CAPABILITY"));

    const readable = result.blockingReasons.map(formatPlanningReason).join(" | ");
    assert.match(readable, /Instructeur niet beschikbaar/);
    assert.match(readable, /Voertuig heeft overlap/);
    assert.match(readable, /Buiten rayon/);
    assert.match(readable, /Instructeur mist verplichte eigenschap/);
  });
});
