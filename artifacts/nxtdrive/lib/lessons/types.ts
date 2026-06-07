export const LESSON_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled_with_refund",
  "cancelled_no_refund",
  "no_show",
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  planned: "Gepland",
  in_progress: "Bezig",
  completed: "Voltooid",
  cancelled_with_refund: "Geannuleerd (refund)",
  cancelled_no_refund: "Geannuleerd",
  no_show: "No-show",
};

export const LESSON_STATUS_VARIANT: Record<
  LessonStatus,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  cancelled_with_refund: "warning",
  cancelled_no_refund: "danger",
  no_show: "danger",
};

/**
 * Extra card classes that make a currently-running ("Bezig") lesson stand out at
 * a glance across the planning views (instructor day list, week, backoffice
 * agenda). The warning ring + soft fill mirror the `in_progress` badge so the
 * surface and the badge read as one signal.
 */
export const LESSON_IN_PROGRESS_CARD =
  "border-warning bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] ring-1 ring-warning/40";

export type Lesson = {
  id: string;
  tenant_id: string;
  instructor_id: string;
  student_id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  location: string | null;
  notes: string | null;
  credits_cost: number;
  cancellation_reason: string | null;
  cancelled_hours_before: number | null;
  refunded_credits: number | null;
  progress_score: number | null;
  progress_summary: string | null;
  // Leskaart L4 - lescontext (zichtbaar voor de leerling). De interne notitie
  // staat NIET hier maar in lesson_internal (staff-only).
  vehicle_id: string | null;
  location_id: string | null;
  student_note: string | null;
  attention_points: string | null;
  advice: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const VEHICLE_TRANSMISSIONS = ["schakel", "automaat"] as const;
export type VehicleTransmission = (typeof VEHICLE_TRANSMISSIONS)[number];

export const VEHICLE_TRANSMISSION_LABEL: Record<VehicleTransmission, string> = {
  schakel: "Schakel",
  automaat: "Automaat",
};

export type Vehicle = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  label: string;
  license_plate: string | null;
  transmission: VehicleTransmission | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Location = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  address: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Full lesson-context snapshot for the instructor cockpit (L4). */
export type LessonContext = {
  vehicleId: string | null;
  locationId: string | null;
  studentNote: string | null;
  attentionPoints: string | null;
  advice: string | null;
  internalNote: string | null;
  topicSkillIds: string[];
};

export type LessonNote = {
  id: string;
  tenant_id: string;
  lesson_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

export type CancellationTier = { hours_before: number; refund_pct: number };
export type CancellationPolicy = {
  tiers: CancellationTier[];
  // Minimum hours of notice a student must give to self-cancel. Stored for the
  // upcoming student self-cancellation flow; the staff cancel_lesson RPC does
  // not gate on it. 0 = no minimum.
  min_notice_hours: number;
};

export function refundPctForHours(
  policy: CancellationPolicy | null,
  hoursBefore: number,
): number {
  if (!policy?.tiers?.length) return 0;
  const sorted = [...policy.tiers].sort(
    (a, b) => b.hours_before - a.hours_before,
  );
  for (const tier of sorted) {
    if (hoursBefore >= tier.hours_before) return tier.refund_pct;
  }
  return 0;
}
