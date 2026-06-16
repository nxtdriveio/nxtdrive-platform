import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthorizedOrganizationContext } from "@/lib/organization";
import type { BranchAccessScope } from "@/lib/permissions";
import type {
  PlanningCandidateInput,
  PlanningKernelData,
} from "@/lib/planning-core";
import { validateScheduleCandidate } from "@/lib/planning-core/validation";
import type { PlanningQueueItem } from "@/lib/planning-queue/types";
import {
  buildQueueCandidateInput,
  planningActorForQueue,
  queueItemCanBeScheduled,
} from "@/lib/planning-queue/validation";

const context = {
  organization: { id: "tenant-1" },
  roles: ["planner"],
  user: {
    id: "planner-1",
    profile: { is_platform_admin: false },
  },
} as unknown as AuthorizedOrganizationContext;

const branchScope: BranchAccessScope = {
  scope_type: "branches",
  branch_ids: ["branch-a"],
};

function item(overrides: Partial<PlanningQueueItem> = {}): PlanningQueueItem {
  return {
    id: "queue-1",
    tenant_id: "tenant-1",
    branch_id: "branch-a",
    student_id: "student-1",
    lead_id: null,
    appointment_type: "exam",
    duration_minutes: 60,
    required_transmission: null,
    preferred_instructor_id: null,
    pickup_address_id: null,
    pickup_service_area_id: "area-a",
    desired_date_from: null,
    desired_date_until: null,
    priority: "normal",
    status: "open",
    required_capabilities: [],
    preferred_capabilities: [],
    required_vehicle_capability_ids: [],
    preferred_vehicle_capability_ids: [],
    notes: null,
    scheduled_entity_type: null,
    scheduled_entity_id: null,
    scheduled_at: null,
    scheduled_by: null,
    last_validation: null,
    created_by: "planner-1",
    created_at: "2026-06-15T00:00:00.000Z",
    updated_at: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(overrides: Partial<PlanningCandidateInput> = {}) {
  return {
    ...buildQueueCandidateInput({
      item: item(),
      actor: planningActorForQueue(context, branchScope),
      instructorId: "instructor-1",
      startAt: new Date("2026-06-15T08:00:00.000Z"),
      vehicleId: null,
    }),
    ...overrides,
  } satisfies PlanningCandidateInput;
}

function data(overrides: Partial<PlanningKernelData> = {}): PlanningKernelData {
  return {
    instructor: {
      id: "instructor-1",
      tenantId: "tenant-1",
      branchIds: ["branch-a"],
      serviceAreaIds: ["area-a"],
      capabilityIds: ["manual"],
      availabilityRules: [
        {
          id: "rule-1",
          tenant_id: "tenant-1",
          branch_id: "branch-a",
          instructor_id: "instructor-1",
          weekday: 1,
          start_min: 480,
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
      rayonPolicy: "warning_only",
      sameAreaTravelMinutes: 10,
      differentAreaTravelMinutes: 30,
      defaultTravelBufferMinutes: 15,
    },
    ...overrides,
  };
}

function codes(result: ReturnType<typeof validateScheduleCandidate>): string[] {
  return [
    ...result.blockingReasons.map((reason) => reason.code),
    ...result.warnings.map((reason) => reason.code),
  ];
}

describe("planning board drop validation", () => {
  it("blocks a drop outside instructor availability", () => {
    const result = validateScheduleCandidate(
      candidate({
        startAt: new Date("2026-06-15T19:00:00.000Z"),
        endAt: new Date("2026-06-15T20:00:00.000Z"),
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("INSTRUCTOR_NOT_AVAILABLE"));
  });

  it("allows a warning drop while surfacing warning reasons", () => {
    const result = validateScheduleCandidate(
      candidate({ preferredInstructorCapabilityIds: ["ev"] }),
      data(),
    );

    assert.equal(result.allowed, true);
    assert.ok(codes(result).includes("PREFERRED_CAPABILITY_MISSING"));
  });

  it("allows a successful queue drop", () => {
    const result = validateScheduleCandidate(candidate(), data());

    assert.equal(result.allowed, true);
    assert.equal(result.blockingReasons.length, 0);
  });

  it("keeps cancelled queue items unschedulable", () => {
    assert.equal(queueItemCanBeScheduled(item({ status: "cancelled" })), false);
  });

  it("blocks cross-branch drops for branch-scoped actors", () => {
    const result = validateScheduleCandidate(
      candidate({
        branchId: "branch-b",
        scope: { type: "branch", tenantId: "tenant-1", branchId: "branch-b" },
      }),
      data(),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("ACTOR_NOT_ALLOWED_FOR_SCOPE"));
  });

  it("blocks vehicle conflicts", () => {
    const result = validateScheduleCandidate(
      candidate({ vehicleId: "vehicle-1" }),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
          status: "active",
        },
        busyIntervals: [
          {
            id: "busy-1",
            entityType: "agenda_appointment",
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

  it("allows reschedule validation to ignore the moved appointment itself", () => {
    const result = validateScheduleCandidate(
      candidate({
        entityType: "agenda_appointment",
        entityId: "appointment-1",
      }),
      data({
        busyIntervals: [
          {
            id: "appointment-1",
            entityType: "agenda_appointment",
            instructorId: "instructor-1",
            startsAt: "2026-06-15T08:00:00.000Z",
            endsAt: "2026-06-15T09:00:00.000Z",
          },
        ],
      }),
    );

    assert.equal(result.allowed, true);
  });
});
