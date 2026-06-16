import type { AgendaAppointmentType } from "@/lib/agenda/types";
import type {
  PlanningReason,
  PlanningValidationResult,
} from "@/lib/planning-core";

export const PLANNING_QUEUE_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type PlanningQueuePriority = (typeof PLANNING_QUEUE_PRIORITIES)[number];

export const PLANNING_QUEUE_STATUSES = [
  "open",
  "suggested",
  "scheduled",
  "cancelled",
] as const;
export type PlanningQueueStatus = (typeof PLANNING_QUEUE_STATUSES)[number];

export type PlanningQueueAppointmentType =
  | AgendaAppointmentType
  | "lesson"
  | "trial_lesson";

export type PlanningQueueScheduledEntityType =
  | "agenda_appointment"
  | "lesson"
  | "trial_lesson";

export type PlanningQueueItem = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  student_id: string | null;
  lead_id: string | null;
  appointment_type: PlanningQueueAppointmentType;
  duration_minutes: number;
  required_transmission: "schakel" | "automaat" | null;
  preferred_instructor_id: string | null;
  pickup_address_id: string | null;
  pickup_service_area_id: string | null;
  desired_date_from: string | null;
  desired_date_until: string | null;
  priority: PlanningQueuePriority;
  status: PlanningQueueStatus;
  required_capabilities: string[];
  preferred_capabilities: string[];
  required_vehicle_capability_ids: string[];
  preferred_vehicle_capability_ids: string[];
  notes: string | null;
  scheduled_entity_type: PlanningQueueScheduledEntityType | null;
  scheduled_entity_id: string | null;
  scheduled_at: string | null;
  scheduled_by: string | null;
  last_validation: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanningQueueListItem = PlanningQueueItem & {
  student_name: string | null;
  lead_name: string | null;
  service_area_name: string | null;
  branch_name: string | null;
  preferred_instructor_name: string | null;
};

export type PlanningQueueUpsertInput = {
  id?: string | null;
  branchId?: string | null;
  studentId?: string | null;
  leadId?: string | null;
  appointmentType: PlanningQueueAppointmentType;
  durationMinutes: number;
  requiredTransmission?: "schakel" | "automaat" | null;
  preferredInstructorId?: string | null;
  pickupAddressId?: string | null;
  pickupServiceAreaId?: string | null;
  desiredDateFrom?: string | null;
  desiredDateUntil?: string | null;
  priority: PlanningQueuePriority;
  requiredCapabilityIds?: readonly string[];
  preferredCapabilityIds?: readonly string[];
  requiredVehicleCapabilityIds?: readonly string[];
  preferredVehicleCapabilityIds?: readonly string[];
  notes?: string | null;
};

export type PlanningQueueScheduleInput = {
  queueItemId: string;
  instructorId: string;
  startAt: Date;
  vehicleId?: string | null;
};

export type PlanningQueueScheduleResult =
  | {
      ok: true;
      entityType: PlanningQueueScheduledEntityType;
      entityId: string;
      validation: PlanningValidationResult;
    }
  | {
      ok: false;
      validation: PlanningValidationResult;
      blockingReasons: PlanningReason[];
    };
