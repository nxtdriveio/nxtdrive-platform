// ---------------------------------------------------------------------------
// Task #87 — Slimme planningslogica. Shared types for the "stel leerling voor"
// engine: given a freed agenda slot, advise the best-fit existing STUDENTS.
//
// This is the inverse of the trial-lesson planner (lib/trial-lessons): there we
// score SLOTS for one lead; here we score STUDENTS for one slot. The route /
// travel-time semantics are reused 1:1 from lib/trial-lessons/route.ts. Purely
// advisory — nothing is ever auto-booked; the planner confirms via the existing
// scheduling flow.
// ---------------------------------------------------------------------------

// How a candidate's travel time was determined (mirrors TrialRouteStatus).
//   computed    — Google Routes API returned a real driving time
//   estimated   — Haversine straight-line estimate (Google unavailable/failed)
//   unavailable — no coordinates to compute against
export const CANDIDATE_ROUTE_STATUSES = [
  "computed",
  "estimated",
  "unavailable",
] as const;
export type CandidateRouteStatus = (typeof CANDIDATE_ROUTE_STATUSES)[number];

// One reason a student earned (or lost) points, surfaced to the planner so the
// suggestion is explainable.
export type CandidateScoreFactor = {
  key:
    | "preferred_daypart"
    | "exam_soon"
    | "near_exam_ready"
    | "recent_cancellation"
    | "idle_with_credit"
    | "ample_credit"
    // Refill opt-in factors — Task #93. A student who explicitly opted in to be
    // invited for freed time ranks higher; a matching preferred moment adds more.
    | "refill_opt_in"
    | "refill_preferred_moment"
    // Lead (trial-lesson) factors — Task #92, used when ranking trial-wanting
    // leads for a freed slot alongside existing students.
    | "lead_preferred_day"
    | "lead_preferred_time"
    | "lead_desired_start"
    | "lead_fast_track"
    | "lead_anxious"
    | "lead_high_score"
    // Route intelligence factors (reused from the trial planner).
    | "route_near_previous"
    | "route_near_next"
    | "route_fits"
    | "route_detour";
  points: number;
  label: string;
};

// Travel insight relative to the slot's surrounding agenda for one candidate.
export type CandidateRouteInsight = {
  status: CandidateRouteStatus;
  // Driving minutes from the previous appointment to this student, and from this
  // student on to the next appointment. Null when no neighbour / not computable.
  travel_to_min: number | null;
  travel_from_min: number | null;
  // Straight-line distances (km) to the nearest neighbours, for context.
  prev_distance_km: number | null;
  next_distance_km: number | null;
  // True when the route could not be confirmed (estimate only, or a gap that
  // does not comfortably fit) and the planner must verify before booking.
  needs_manual_confirm: boolean;
};

// A scored student candidate for a slot (never persisted — advisory only).
export type StudentCandidate = {
  student_id: string;
  full_name: string;
  balance_min: number;
  // Whether this student opted in to refill (wachtlijst) invitations. The invite
  // RPC enforces opt-in at the DB level, so the UI only offers "Uitnodigen" for
  // opted-in candidates; non-opted-in students still appear (advisory "Plan in").
  refill_opt_in: boolean;
  score: number;
  factors: CandidateScoreFactor[];
  reason: string;
  route: CandidateRouteInsight | null;
};

// Task #92 — a scored LEAD candidate for a freed slot. Leads who want a trial
// lesson are ranked alongside students; the planner books a (provisional) trial
// via the normal flow. Never persisted — advisory only.
export type LeadCandidate = {
  lead_id: string;
  full_name: string;
  lead_score: number;
  // The trial duration to prefill (the freed slot's length, clamped to a valid
  // trial duration of 60/90/120 minutes).
  trial_duration_min: number;
  pickup_location: string | null;
  score: number;
  factors: CandidateScoreFactor[];
  reason: string;
  route: CandidateRouteInsight | null;
};

// Combined advisory result for a freed slot: best-fit students + trial-wanting
// leads, each list ranked best-first.
export type SlotCandidates = {
  students: StudentCandidate[];
  leads: LeadCandidate[];
};
