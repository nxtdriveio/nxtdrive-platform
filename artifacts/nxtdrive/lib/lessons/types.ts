export const LESSON_STATUSES = [
  "planned",
  "completed",
  "cancelled_with_refund",
  "cancelled_no_refund",
  "no_show",
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  planned: "Gepland",
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
  completed: "success",
  cancelled_with_refund: "warning",
  cancelled_no_refund: "danger",
  no_show: "danger",
};

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
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CancellationTier = { hours_before: number; refund_pct: number };
export type CancellationPolicy = { tiers: CancellationTier[] };

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
