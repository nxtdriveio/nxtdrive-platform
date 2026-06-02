export const LEAD_STATUSES = [
  "new",
  "contacted",
  "package_advised",
  "converted",
  "dropped",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "website",
  "google",
  "instagram",
  "facebook",
  "whatsapp",
  "referral",
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
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nieuw",
  contacted: "Contact opgenomen",
  package_advised: "Pakketadvies",
  converted: "Klant geworden",
  dropped: "Afgehaakt",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  referral: "Referral",
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
};

export const LEAD_STATUS_VARIANT: Record<
  LeadStatus,
  "info" | "warning" | "primary" | "success" | "danger"
> = {
  new: "info",
  contacted: "warning",
  package_advised: "primary",
  converted: "success",
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
  created_at: string;
  updated_at: string;
};

export type LeadEvent = {
  id: string;
  lead_id: string;
  tenant_id: string;
  actor_user_id: string | null;
  event_type: LeadEventType;
  payload: Record<string, unknown>;
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
