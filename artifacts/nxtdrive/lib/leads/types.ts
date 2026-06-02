// ---------------------------------------------------------------------------
// Lead funnel — 15-status spec funnel (Task #54). Existing values
// (new/contacted/package_advised/converted/dropped) are preserved; the rest
// extend the funnel. Order here is the funnel order used by the dashboard.
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "intake_completed",
  "trial_offered",
  "trial_planned",
  "trial_confirmed",
  "trial_completed",
  "assessment_pending",
  "assessment_done",
  "package_advised",
  "payment_pending",
  "paid",
  "converted",
  "follow_up",
  "dropped",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Monotonic funnel rank for forward-only automation progression. */
export const LEAD_STATUS_RANK: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  intake_completed: 2,
  trial_offered: 3,
  trial_planned: 4,
  trial_confirmed: 5,
  trial_completed: 6,
  assessment_pending: 7,
  assessment_done: 8,
  package_advised: 9,
  payment_pending: 10,
  paid: 11,
  converted: 12,
  follow_up: 1,
  dropped: 0,
};

/** Statuses the automation engine never overrides (manual/terminal). */
export const LEAD_TERMINAL_STATUSES: readonly LeadStatus[] = [
  "converted",
  "dropped",
];

export const LEAD_ACTION_STATUSES = [
  "none",
  "awaiting_us",
  "awaiting_lead",
  "scheduled",
  "closed",
] as const;
export type LeadActionStatus = (typeof LEAD_ACTION_STATUSES)[number];

export const LEAD_ACTION_STATUS_LABEL: Record<LeadActionStatus, string> = {
  none: "Geen actie",
  awaiting_us: "Actie bij ons",
  awaiting_lead: "Wachten op lead",
  scheduled: "Ingepland",
  closed: "Afgehandeld",
};

export const LEAD_ACTION_STATUS_VARIANT: Record<
  LeadActionStatus,
  "info" | "warning" | "primary" | "success" | "default"
> = {
  none: "default",
  awaiting_us: "warning",
  awaiting_lead: "info",
  scheduled: "primary",
  closed: "success",
};

export const LEAD_SOURCES = [
  "website",
  "google",
  "instagram",
  "facebook",
  "whatsapp",
  "referral",
  "intake_wizard",
  "manual",
  "phone",
  "email",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_EVENT_TYPES = [
  "created",
  "status_changed",
  "assigned",
  "note",
  "contacted",
  "trial_requested",
  "trial_confirmed",
  "trial_rescheduled",
  "trial_rejected",
  "intake_completed",
  "score_updated",
  "lost",
  "follow_up_scheduled",
  "assessment_due",
  "package_advised",
  "payment_pending",
  "paid",
  "reengaged",
  "task_auto_created",
  "task_completed",
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nieuw",
  contacted: "Contact opgenomen",
  intake_completed: "Intake voltooid",
  trial_offered: "Proefles aangeboden",
  trial_planned: "Proefles gepland",
  trial_confirmed: "Proefles bevestigd",
  trial_completed: "Proefles afgerond",
  assessment_pending: "Beoordeling open",
  assessment_done: "Beoordeeld",
  package_advised: "Pakketadvies",
  payment_pending: "Betaling open",
  paid: "Betaald",
  converted: "Klant geworden",
  follow_up: "Later opvolgen",
  dropped: "Afgehaakt",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  referral: "Referral",
  intake_wizard: "Intake-wizard",
  manual: "Handmatig",
  phone: "Telefoon",
  email: "E-mail",
  other: "Overig",
};

export const LEAD_EVENT_LABEL: Record<LeadEventType, string> = {
  created: "Aangemaakt",
  status_changed: "Status gewijzigd",
  assigned: "Toegewezen",
  note: "Notitie",
  contacted: "Contact gehad",
  trial_requested: "Proefles aangevraagd",
  trial_confirmed: "Proefles bevestigd",
  trial_rescheduled: "Proefles verzet",
  trial_rejected: "Proefles afgewezen",
  intake_completed: "Intake voltooid",
  score_updated: "Leadscore bijgewerkt",
  lost: "Afgehaakt",
  follow_up_scheduled: "Opvolging gepland",
  assessment_due: "Beoordeling open",
  package_advised: "Pakketadvies verstuurd",
  payment_pending: "Betaling open",
  paid: "Betaald",
  reengaged: "Heractivering",
  task_auto_created: "Automatische taak",
  task_completed: "Taak afgerond",
};

// Short, plain-language "next best action" hint per funnel status (Fase 1B —
// Task #56). Derived purely from the lead's current status, so it is available
// for every lead in the list/detail without an extra query. Mirrors the
// operational STATUS_PLANS in lib/leads/automation.ts.
export const LEAD_NEXT_ACTION_HINT: Record<LeadStatus, string> = {
  new: "Bel deze nieuwe aanvraag",
  contacted: "Wachten op reactie van de lead",
  intake_completed: "Beoordeel de intake en plan een proefles",
  trial_offered: "Wachten op keuze proeflesmoment",
  trial_planned: "Bevestig het gekozen proeflesmoment",
  trial_confirmed: "Geef de proefles",
  trial_completed: "Maak de beoordeling",
  assessment_pending: "Maak de beoordeling",
  assessment_done: "Stuur het pakketadvies",
  package_advised: "Volg de betaling op",
  payment_pending: "Volg de betaling op",
  paid: "Zet de lead om naar leerling",
  converted: "Afgerond — klant geworden",
  follow_up: "Later opvolgen",
  dropped: "Afgehaakt",
};

export const LEAD_STATUS_VARIANT: Record<
  LeadStatus,
  "info" | "warning" | "primary" | "success" | "danger" | "default"
> = {
  new: "info",
  contacted: "info",
  intake_completed: "primary",
  trial_offered: "warning",
  trial_planned: "warning",
  trial_confirmed: "primary",
  trial_completed: "primary",
  assessment_pending: "warning",
  assessment_done: "primary",
  package_advised: "primary",
  payment_pending: "warning",
  paid: "success",
  converted: "success",
  follow_up: "info",
  dropped: "danger",
};

export type Lead = {
  id: string;
  tenant_id: string;
  status: LeadStatus;
  source: LeadSource;
  full_name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  message: string | null;
  assigned_to: string | null;
  // Task #54 — dashboard columns.
  action_status: LeadActionStatus;
  priority: "low" | "normal" | "high" | "urgent";
  lead_score: number;
  lead_score_reason: LeadScoreReason[];
  assigned_owner_id: string | null;
  assigned_instructor_id: string | null;
  assigned_location_id: string | null;
  preferred_license_goal: IntakeLicenseGoal | null;
  preferred_transmission: IntakeTransmission | null;
  role_type: IntakeApplicantType | null;
  birth_date: string | null;
  city: string | null;
  neighborhood: string | null;
  pickup_address: string | null;
  pickup_place_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  desired_start_date: string | null;
  last_activity_at: string;
  next_action_at: string | null;
  converted_to_student_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  source_detail: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadScoreReason = {
  code: string;
  label: string;
  points: number;
};

export type LeadEvent = {
  id: string;
  lead_id: string;
  tenant_id: string;
  actor_user_id: string | null;
  event_type: LeadEventType;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Intake wizard (Fase 1) — structured, typed intake answers per lead.
// ---------------------------------------------------------------------------

export const INTAKE_APPLICANT_TYPES = ["student", "guardian"] as const;
export type IntakeApplicantType = (typeof INTAKE_APPLICANT_TYPES)[number];
export const INTAKE_APPLICANT_TYPE_LABEL: Record<IntakeApplicantType, string> = {
  student: "Leerling zelf",
  guardian: "Ouder / verzorger",
};

export const INTAKE_TRANSMISSIONS = ["manual", "automatic"] as const;
export type IntakeTransmission = (typeof INTAKE_TRANSMISSIONS)[number];
export const INTAKE_TRANSMISSION_LABEL: Record<IntakeTransmission, string> = {
  manual: "Schakel",
  automatic: "Automaat",
};

export const INTAKE_LICENSE_GOALS = ["B", "BE", "AM", "A", "T", "other"] as const;
export type IntakeLicenseGoal = (typeof INTAKE_LICENSE_GOALS)[number];
export const INTAKE_LICENSE_GOAL_LABEL: Record<IntakeLicenseGoal, string> = {
  B: "Auto (B)",
  BE: "Auto met aanhanger (BE)",
  AM: "Brommer / scooter (AM)",
  A: "Motor (A)",
  T: "Tractor (T)",
  other: "Anders",
};

export const INTAKE_PACES = ["relaxed", "fast"] as const;
export type IntakePace = (typeof INTAKE_PACES)[number];
export const INTAKE_PACE_LABEL: Record<IntakePace, string> = {
  relaxed: "Rustig traject",
  fast: "Snel traject",
};

export const INTAKE_STATUSES = ["yes", "no", "unknown"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];
export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  yes: "Ja",
  no: "Nee",
  unknown: "Weet ik niet / n.v.t.",
};

export const INTAKE_WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type IntakeWeekday = (typeof INTAKE_WEEKDAYS)[number];
export const INTAKE_WEEKDAY_LABEL: Record<IntakeWeekday, string> = {
  mon: "Maandag",
  tue: "Dinsdag",
  wed: "Woensdag",
  thu: "Donderdag",
  fri: "Vrijdag",
  sat: "Zaterdag",
  sun: "Zondag",
};

export const INTAKE_DAYPARTS = [
  "morning",
  "afternoon",
  "evening",
  "weekend",
] as const;
export type IntakeDaypart = (typeof INTAKE_DAYPARTS)[number];
export const INTAKE_DAYPART_LABEL: Record<IntakeDaypart, string> = {
  morning: "Ochtend",
  afternoon: "Middag",
  evening: "Avond",
  weekend: "Weekend",
};

export type LeadIntakeDetail = {
  id: string;
  lead_id: string;
  tenant_id: string;
  applicant_type: IntakeApplicantType;
  date_of_birth: string | null;
  city: string | null;
  pickup_location: string | null;
  license_goal: IntakeLicenseGoal | null;
  transmission: IntakeTransmission | null;
  has_driving_experience: boolean | null;
  had_lessons_before: boolean | null;
  has_done_exam: boolean | null;
  theory_status: IntakeStatus;
  health_declaration_status: IntakeStatus;
  cbr_authorization_status: IntakeStatus;
  preferred_days: string[];
  preferred_times: string[];
  weekly_availability: string | null;
  desired_start_date: string | null;
  lessons_per_week: number | null;
  pace: IntakePace | null;
  has_anxiety: boolean | null;
  remarks: string | null;
  terms_accepted: boolean;
  terms_accepted_at: string | null;
  created_at: string;
  updated_at: string;
};
