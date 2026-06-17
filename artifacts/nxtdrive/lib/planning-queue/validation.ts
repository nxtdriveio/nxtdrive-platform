import type { AuthorizedOrganizationContext } from "@/lib/organization";
import { canAccessBranch, rolesGrantPermission } from "@/lib/permissions";
import type { BranchAccessScope } from "@/lib/permissions";
import type {
  PlanningActorAccess,
  PlanningCandidateInput,
  PlanningScope,
  PlanningValidationResult,
} from "@/lib/planning-core";
import type {
  PlanningQueueItem,
  PlanningQueueScheduledEntityType,
} from "@/lib/planning-queue/types";

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string")),
  );
}

export function canReadPlanningQueueItem(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  item: Pick<
    PlanningQueueItem,
    "branch_id" | "preferred_instructor_id" | "student_id"
  >,
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  if (canAccessBranch(branchScope, item.branch_id)) return true;
  return Boolean(
    item.preferred_instructor_id &&
    context.roles.includes("instructor") &&
    item.preferred_instructor_id === context.user.id,
  );
}

export function canManagePlanningQueueItem(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  item: Pick<PlanningQueueItem, "branch_id" | "preferred_instructor_id">,
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  return (
    rolesGrantPermission(context.roles, "planning:manage") &&
    canAccessBranch(branchScope, item.branch_id)
  );
}

export function queueItemCanBeScheduled(
  item: Pick<PlanningQueueItem, "status">,
): boolean {
  return item.status === "open" || item.status === "suggested";
}

export function planningActorForQueue(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
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

export function planningScopeForQueueItem(
  tenantId: string,
  branchId: string | null,
): PlanningScope {
  return branchId
    ? { type: "branch", tenantId, branchId }
    : { type: "tenant", tenantId };
}

export function buildQueueCandidateInput(input: {
  item: PlanningQueueItem;
  actor: PlanningActorAccess;
  instructorId: string;
  startAt: Date;
  vehicleId?: string | null;
}): PlanningCandidateInput {
  const endAt = new Date(
    input.startAt.getTime() + input.item.duration_minutes * 60000,
  );
  return {
    actor: input.actor,
    scope: planningScopeForQueueItem(
      input.item.tenant_id,
      input.item.branch_id,
    ),
    entityType: "queue_item",
    entityId: input.item.id,
    tenantId: input.item.tenant_id,
    branchId: input.item.branch_id,
    studentId: input.item.student_id,
    instructorId: input.instructorId,
    vehicleId: input.vehicleId ?? null,
    startAt: input.startAt,
    endAt,
    pickupServiceAreaId: input.item.pickup_service_area_id,
    requiredTransmission: input.item.required_transmission,
    requiredInstructorCapabilityIds: input.item.required_capabilities,
    preferredInstructorCapabilityIds: input.item.preferred_capabilities,
    requiredVehicleCapabilityIds: input.item.required_vehicle_capability_ids,
    preferredVehicleCapabilityIds: input.item.preferred_vehicle_capability_ids,
  };
}

export function scheduleDecisionForValidation(
  validation: PlanningValidationResult,
): "scheduled" | "open" {
  return validation.allowed ? "scheduled" : "open";
}

export function scheduledEntityTypeForQueueItem(
  item: Pick<PlanningQueueItem, "appointment_type">,
): PlanningQueueScheduledEntityType {
  if (item.appointment_type === "lesson") return "lesson";
  if (item.appointment_type === "trial_lesson") return "trial_lesson";
  return "agenda_appointment";
}

export function validationToJson(
  validation: PlanningValidationResult,
): unknown {
  return {
    allowed: validation.allowed,
    blockingReasons: validation.blockingReasons,
    warnings: validation.warnings,
  };
}
