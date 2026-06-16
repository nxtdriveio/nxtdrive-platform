import type {
  PlanningReason,
  PlanningValidationResult,
} from "@/lib/planning-core";
import type { PlanningQueueListItem } from "@/lib/planning-queue";

export type PlanningBoardView = "day" | "week";

export type PlanningBoardFilters = {
  date: string;
  view: PlanningBoardView;
  branchId?: string | null;
  appointmentType?: string | null;
  serviceAreaId?: string | null;
  instructorId?: string | null;
  transmission?: string | null;
  capabilityId?: string | null;
  vehicleId?: string | null;
  availability?: "available" | "blocked" | null;
  conflictsOnly?: boolean;
  status?: string | null;
};

export type PlanningBoardInstructor = {
  id: string;
  name: string;
};

export type PlanningBoardOption = {
  id: string;
  label: string;
};

export type PlanningBoardAvailability = {
  id: string;
  instructorId: string;
  date: string | null;
  weekday: number | null;
  startMinute: number;
  endMinute: number;
  kind: "available" | "blocked";
  note?: string | null;
};

export type PlanningBoardEvent = {
  id: string;
  entityType: "lesson" | "trial_lesson" | "agenda_appointment";
  instructorId: string;
  branchId: string | null;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  appointmentType?: string | null;
  status?: string | null;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  serviceAreaId?: string | null;
  serviceAreaName?: string | null;
  warnings?: PlanningReason[];
};

export type PlanningBoardData = {
  tenantId: string;
  filters: PlanningBoardFilters;
  rangeStart: string;
  rangeEnd: string;
  defaultVehicleId: string | null;
  days: string[];
  instructors: PlanningBoardInstructor[];
  events: PlanningBoardEvent[];
  queueItems: PlanningQueueListItem[];
  availability: PlanningBoardAvailability[];
  branches: PlanningBoardOption[];
  serviceAreas: PlanningBoardOption[];
  vehicles: PlanningBoardOption[];
  capabilities: PlanningBoardOption[];
};

export type PlanningBoardPreviewResult = {
  ok: boolean;
  validation?: PlanningValidationResult;
  message?: string;
};

export type PlanningBoardDropResult = PlanningBoardPreviewResult & {
  scheduled?: boolean;
  entityId?: string | null;
};
