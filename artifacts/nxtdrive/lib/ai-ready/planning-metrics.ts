import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiBookingScoreHistoryRow = {
  tenant_id: string;
  branch_id: string | null;
  booking_request_id: string;
  booking_candidate_id: string;
  source: string;
  requester_type: string;
  entity_type: string;
  request_status: string;
  lead_id: string | null;
  student_id: string | null;
  instructor_id: string;
  vehicle_id: string | null;
  rank: number;
  score: number;
  warning_count: number;
  blocking_count: number;
  route_status: string | null;
  route_travel_to_min: number | null;
  route_travel_from_min: number | null;
  route_total_travel_min: number | null;
  route_needs_confirm: boolean;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  candidate_status: string;
  preference_count: number;
  best_preference_rank: number | null;
  preference_confirmed: boolean;
  confirmation_count: number;
  accepted_count: number;
  declined_count: number;
  expired_count: number;
  hold_count: number;
  confirmed_hold_count: number;
  candidate_outcome: string;
  minutes_from_request_to_slot: number | null;
  minutes_to_first_signal: number | null;
  created_at: string;
  updated_at: string;
};

export type AiBookingOutcomeTrackingRow = {
  tenant_id: string;
  branch_id: string | null;
  booking_request_id: string;
  source: string;
  requester_type: string;
  entity_type: string;
  status: string;
  lead_id: string | null;
  student_id: string | null;
  required_transmission: string | null;
  preferred_instructor_id: string | null;
  requested_duration_min: number | null;
  desired_start_date: string | null;
  confirmed_entity_type: string | null;
  confirmed_entity_id: string | null;
  lead_converted_at: string | null;
  outcome: string;
  candidate_count: number;
  best_score: number | null;
  avg_score: number | null;
  first_candidate_at: string | null;
  first_slot_at: string | null;
  confirmed_candidate_count: number;
  expired_candidate_count: number;
  rejected_candidate_count: number;
  avg_route_total_travel_min: number | null;
  avg_warning_count: number | null;
  preference_count: number;
  first_preference_at: string | null;
  confirmation_count: number;
  accepted_count: number;
  declined_count: number;
  confirmation_expired_count: number;
  accepted_at: string | null;
  declined_at: string | null;
  hold_count: number;
  confirmed_hold_count: number;
  hold_confirmed_at: string | null;
  minutes_to_outcome: number | null;
  created_at: string;
  updated_at: string;
};

export type AiLessonOutcomeTrackingRow = {
  tenant_id: string;
  branch_id: string | null;
  lesson_id: string;
  student_id: string;
  instructor_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  duration_min: number | null;
  credits_cost: number;
  refunded_credits: number | null;
  cancelled_hours_before: number | null;
  has_location_coordinates: boolean;
  booking_request_id: string | null;
  booking_source: string | null;
  booking_requester_type: string | null;
  lesson_outcome: string;
  no_show_count: number;
  cancellation_count: number;
  scheduled_minutes: number;
  created_at: string;
  updated_at: string;
};

export type AiPlanningQualityDailyRow = {
  tenant_id: string;
  branch_id: string | null;
  metric_date: string;
  lesson_count: number;
  completed_count: number;
  no_show_count: number;
  cancelled_count: number;
  no_show_rate: number | null;
  cancellation_rate: number | null;
  avg_lesson_minutes: number | null;
  candidate_count: number;
  avg_candidate_score: number | null;
  avg_warning_count: number | null;
  avg_route_total_travel_min: number | null;
  confirmed_candidate_count: number;
  candidate_conversion_rate: number | null;
  booking_request_count: number;
  confirmed_request_count: number;
  failed_request_count: number;
  booking_conversion_rate: number | null;
};

export type AiReadyPlanningMetrics = {
  scoreHistory: AiBookingScoreHistoryRow[];
  bookingOutcomes: AiBookingOutcomeTrackingRow[];
  lessonOutcomes: AiLessonOutcomeTrackingRow[];
  qualityDaily: AiPlanningQualityDailyRow[];
};

export type LoadAiReadyPlanningMetricsOptions = {
  branchIds?: readonly string[] | null;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

function applyBranchScope<T>(
  query: T,
  branchIds: readonly string[] | null | undefined,
): T {
  if (!branchIds) return query;
  if (branchIds.length === 0) return (query as { limit: (n: number) => T }).limit(0);
  return (query as { in: (column: string, values: readonly string[]) => T }).in(
    "branch_id",
    branchIds,
  );
}

function assertNoError(label: string, error: unknown): void {
  if (!error) return;
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "Unknown Supabase error";
  throw new Error(`${label}: ${message}`);
}

export async function loadAiReadyPlanningMetrics(
  client: SupabaseClient,
  tenantId: string,
  opts: LoadAiReadyPlanningMetricsOptions = {},
): Promise<AiReadyPlanningMetrics> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  let scoreQuery = client
    .from("ai_booking_score_history")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  scoreQuery = applyBranchScope(scoreQuery, opts.branchIds);
  if (opts.fromDate) scoreQuery = scoreQuery.gte("starts_at", opts.fromDate);
  if (opts.toDate) scoreQuery = scoreQuery.lte("starts_at", opts.toDate);

  let bookingQuery = client
    .from("ai_booking_outcome_tracking")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  bookingQuery = applyBranchScope(bookingQuery, opts.branchIds);
  if (opts.fromDate) bookingQuery = bookingQuery.gte("created_at", opts.fromDate);
  if (opts.toDate) bookingQuery = bookingQuery.lte("created_at", opts.toDate);

  let lessonQuery = client
    .from("ai_lesson_outcome_tracking")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("starts_at", { ascending: false })
    .limit(limit);
  lessonQuery = applyBranchScope(lessonQuery, opts.branchIds);
  if (opts.fromDate) lessonQuery = lessonQuery.gte("starts_at", opts.fromDate);
  if (opts.toDate) lessonQuery = lessonQuery.lte("starts_at", opts.toDate);

  let qualityQuery = client
    .from("ai_planning_quality_daily")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("metric_date", { ascending: false })
    .limit(limit);
  qualityQuery = applyBranchScope(qualityQuery, opts.branchIds);
  if (opts.fromDate) qualityQuery = qualityQuery.gte("metric_date", opts.fromDate);
  if (opts.toDate) qualityQuery = qualityQuery.lte("metric_date", opts.toDate);

  const [scoreRes, bookingRes, lessonRes, qualityRes] = await Promise.all([
    scoreQuery,
    bookingQuery,
    lessonQuery,
    qualityQuery,
  ]);

  assertNoError("load ai score history", scoreRes.error);
  assertNoError("load ai booking outcomes", bookingRes.error);
  assertNoError("load ai lesson outcomes", lessonRes.error);
  assertNoError("load ai planning quality", qualityRes.error);

  return {
    scoreHistory: (scoreRes.data ?? []) as AiBookingScoreHistoryRow[],
    bookingOutcomes: (bookingRes.data ?? []) as AiBookingOutcomeTrackingRow[],
    lessonOutcomes: (lessonRes.data ?? []) as AiLessonOutcomeTrackingRow[],
    qualityDaily: (qualityRes.data ?? []) as AiPlanningQualityDailyRow[],
  };
}
