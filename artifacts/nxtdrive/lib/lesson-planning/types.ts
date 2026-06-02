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
  score: number;
  factors: CandidateScoreFactor[];
  reason: string;
  route: CandidateRouteInsight | null;
};
