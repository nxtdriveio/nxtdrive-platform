// ---------------------------------------------------------------------------
// Fase 2 — Slimme Proeflesplanner. Shared types for trial lessons (proeflessen).
// A trial lesson is linked to a LEAD (not a student) and never touches credits.
// ---------------------------------------------------------------------------

export const TRIAL_LESSON_STATUSES = [
  "available",
  "suggested",
  "provisional",
  "confirmed",
  "cancelled",
  "rejected",
] as const;
export type TrialLessonStatus = (typeof TRIAL_LESSON_STATUSES)[number];

export const TRIAL_LESSON_STATUS_LABEL: Record<TrialLessonStatus, string> = {
  available: "Beschikbaar",
  suggested: "Voorgesteld",
  provisional: "Voorlopig gekozen",
  confirmed: "Bevestigd",
  cancelled: "Geannuleerd",
  rejected: "Afgewezen",
};

export const TRIAL_LESSON_STATUS_VARIANT: Record<
  TrialLessonStatus,
  "info" | "warning" | "primary" | "success" | "danger" | "default" | "outline"
> = {
  available: "outline",
  suggested: "info",
  provisional: "warning",
  confirmed: "success",
  cancelled: "default",
  rejected: "danger",
};

// Allowed trial-lesson durations, in minutes (proeflesduur).
export const TRIAL_LESSON_DURATIONS = [60, 90, 120] as const;
export type TrialLessonDuration = (typeof TRIAL_LESSON_DURATIONS)[number];

export type TrialLesson = {
  id: string;
  tenant_id: string;
  lead_id: string;
  instructor_id: string;
  status: TrialLessonStatus;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  pickup_location: string | null;
  score: number;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Fase 3 — Route Intelligence (all nullable; graceful degradation).
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_place_id: string | null;
  pickup_formatted_address: string | null;
  route_status: TrialRouteStatus;
  route_travel_to_min: number | null;
  route_travel_from_min: number | null;
  route_needs_confirm: boolean;
};

// How the travel time for a slot was determined.
//   computed    — Google Routes API returned a real driving time
//   estimated   — Haversine straight-line estimate (Google unavailable/failed)
//   unavailable — no coordinates to compute against
export const TRIAL_ROUTE_STATUSES = [
  "computed",
  "estimated",
  "unavailable",
] as const;
export type TrialRouteStatus = (typeof TRIAL_ROUTE_STATUSES)[number];

// One reason a slot earned points, surfaced in the backoffice so the instructor
// understands why a slot was suggested.
export type TrialScoreFactor = {
  key:
    | "preferred_day"
    | "preferred_time"
    | "desired_start_window"
    | "anxious_not_rushed"
    | "fast_track_early"
    // Fase 3 — Route Intelligence factors.
    | "route_near_previous"
    | "route_near_next"
    | "route_fits"
    | "route_detour";
  points: number;
  label: string;
};

// Route insight attached to a suggestion / persisted on a chosen trial. Tells
// the backoffice how reachable a slot is relative to the surrounding agenda.
export type TrialRouteInsight = {
  status: TrialRouteStatus;
  // Driving minutes from the previous appointment to this pickup, and from this
  // pickup on to the next appointment. Null when there is no neighbour or it
  // could not be computed.
  travel_to_min: number | null;
  travel_from_min: number | null;
  // Straight-line distances (km) to the nearest neighbours, for context.
  prev_distance_km: number | null;
  next_distance_km: number | null;
  // True when the route could not be confirmed (no Google / estimate only) and
  // an instructor must verify the slot is realistic before confirming.
  needs_manual_confirm: boolean;
};

// A computed trial-lesson suggestion (not persisted until the prospect picks it).
export type TrialSuggestion = {
  instructor_id: string;
  instructor_name: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  pickup_location: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_place_id: string | null;
  pickup_formatted_address: string | null;
  score: number;
  factors: TrialScoreFactor[];
  reason: string;
  route: TrialRouteInsight | null;
};
