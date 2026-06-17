import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthorizedOrganizationContext } from "@/lib/organization";
import type { BranchAccessScope } from "@/lib/permissions";
import { validateScheduleCandidate } from "@/lib/planning-core/validation";
import type { PlanningKernelData } from "@/lib/planning-core";
import type { PlanningQueueItem } from "@/lib/planning-queue/types";
import {
  buildQueueCandidateInput,
  canManagePlanningQueueItem,
  planningActorForQueue,
  queueItemCanBeScheduled,
  scheduleDecisionForValidation,
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

function queueItem(
  overrides: Partial<PlanningQueueItem> = {},
): PlanningQueueItem {
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

function candidate(item: PlanningQueueItem, vehicleId: string | null = null) {
  return buildQueueCandidateInput({
    item,
    actor: planningActorForQueue(context, branchScope),
    instructorId: "instructor-1",
    startAt: new Date("2026-06-15T08:00:00.000Z"),
    vehicleId,
  });
}

function codes(result: ReturnType<typeof validateScheduleCandidate>): string[] {
  return result.blockingReasons.map((reason) => reason.code);
}

describe("planning queue validation", () => {
  it("blocks branch A users from managing branch B queue items", () => {
    assert.equal(
      canManagePlanningQueueItem(context, branchScope, queueItem()),
      true,
    );
    assert.equal(
      canManagePlanningQueueItem(
        context,
        branchScope,
        queueItem({ branch_id: "branch-b" }),
      ),
      false,
    );
  });

  it("keeps instructor-linked queue items read-only for scheduling writes", () => {
    const instructorContext = {
      ...context,
      roles: ["instructor"],
      user: {
        id: "instructor-1",
        profile: { is_platform_admin: false },
      },
    } as unknown as AuthorizedOrganizationContext;

    assert.equal(
      canManagePlanningQueueItem(
        instructorContext,
        branchScope,
        queueItem({ preferred_instructor_id: "instructor-1" }),
      ),
      false,
    );
  });

  it("requires instructor capabilities before a suggestion can pass", () => {
    const item = queueItem({ required_capabilities: ["manual"] });
    const result = validateScheduleCandidate(candidate(item), data());

    assert.equal(result.allowed, true);

    const mismatch = validateScheduleCandidate(
      candidate(queueItem({ required_capabilities: ["hazmat"] })),
      data(),
    );
    assert.equal(mismatch.allowed, false);
    assert.ok(codes(mismatch).includes("MISSING_REQUIRED_CAPABILITY"));
  });

  it("blocks pickup service areas outside rayon when policy is hard_block", () => {
    const item = queueItem({ pickup_service_area_id: "area-b" });
    const result = validateScheduleCandidate(candidate(item), data());

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("OUTSIDE_INSTRUCTOR_SERVICE_AREA"));
  });

  it("warns for pickup service areas outside rayon when policy is warning_only", () => {
    const item = queueItem({ pickup_service_area_id: "area-b" });
    const result = validateScheduleCandidate(
      candidate(item),
      data({ settings: { rayonPolicy: "warning_only" } }),
    );

    assert.equal(result.allowed, true);
    assert.ok(
      result.warnings
        .map((warning) => warning.code)
        .includes("OUTSIDE_INSTRUCTOR_SERVICE_AREA"),
    );
  });

  it("blocks unsuitable vehicles for required vehicle capabilities", () => {
    const item = queueItem({
      required_vehicle_capability_ids: ["dual_controls"],
    });
    const result = validateScheduleCandidate(
      candidate(item, "vehicle-1"),
      data({
        vehicle: {
          id: "vehicle-1",
          tenantId: "tenant-1",
          branchId: "branch-a",
          status: "active",
          capabilityIds: ["automatic"],
        },
      }),
    );

    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes("MISSING_REQUIRED_VEHICLE_CAPABILITY"));
  });

  it("leaves queue items open when scheduling validation blocks", () => {
    const result = validateScheduleCandidate(
      candidate(queueItem({ required_capabilities: ["hazmat"] })),
      data(),
    );

    assert.equal(scheduleDecisionForValidation(result), "open");
  });

  it("marks queue items scheduled when validation succeeds", () => {
    const result = validateScheduleCandidate(candidate(queueItem()), data());

    assert.equal(result.allowed, true);
    assert.equal(scheduleDecisionForValidation(result), "scheduled");
  });

  it("does not allow cancelled queue items to be scheduled", () => {
    assert.equal(
      queueItemCanBeScheduled(queueItem({ status: "cancelled" })),
      false,
    );
    assert.equal(
      queueItemCanBeScheduled(queueItem({ status: "scheduled" })),
      false,
    );
    assert.equal(queueItemCanBeScheduled(queueItem({ status: "open" })), true);
  });
});
