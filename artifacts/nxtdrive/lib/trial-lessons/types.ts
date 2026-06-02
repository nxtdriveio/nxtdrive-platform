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
};

// One reason a slot earned points, surfaced in the backoffice so the instructor
// understands why a slot was suggested.
export type TrialScoreFactor = {
  key:
    | "preferred_day"
    | "preferred_time"
    | "desired_start_window"
    | "anxious_not_rushed"
    | "fast_track_early";
  points: number;
  label: string;
};

// A computed trial-lesson suggestion (not persisted until the prospect picks it).
export type TrialSuggestion = {
  instructor_id: string;
  instructor_name: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  pickup_location: string | null;
  score: number;
  factors: TrialScoreFactor[];
  reason: string;
};
