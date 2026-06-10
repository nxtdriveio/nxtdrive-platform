// ---------------------------------------------------------------------------
// Agenda appointment model (alle afspraaktypes naast les/proefles).
//
// English enum values mirror the DB enum `agenda_appointment_type`; Dutch labels
// and the visual styling live here in the application layer.
// ---------------------------------------------------------------------------

export const AGENDA_APPOINTMENT_TYPES = [
  "exam",
  "interim_test",
  "theory_guidance",
  "free_block",
  "break",
  "private_block",
  "maintenance",
  "admin",
  "vacation",
] as const;
export type AgendaAppointmentType = (typeof AGENDA_APPOINTMENT_TYPES)[number];

export const AGENDA_APPOINTMENT_STATUSES = [
  "planned",
  "completed",
  "cancelled",
] as const;
export type AgendaAppointmentStatus =
  (typeof AGENDA_APPOINTMENT_STATUSES)[number];

// Examen-/toetsuitslag - mirror van DB enum `agenda_appointment_result`.
export const AGENDA_APPOINTMENT_RESULTS = [
  "passed",
  "failed",
  "no_show",
] as const;
export type AgendaAppointmentResult =
  (typeof AGENDA_APPOINTMENT_RESULTS)[number];

export const AGENDA_VISIBILITY_SCOPES = [
  "personal",
  "shared_staff",
  "team",
] as const;
export type AgendaVisibilityScope =
  (typeof AGENDA_VISIBILITY_SCOPES)[number];

export const APPOINTMENT_RESULT_LABEL: Record<AgendaAppointmentResult, string> = {
  passed: "Geslaagd",
  failed: "Gezakt",
  no_show: "Niet verschenen",
};

// Types waarvoor een uitslag (geslaagd/gezakt) vastgelegd kan worden.
export function isResultableType(type: AgendaAppointmentType): boolean {
  return type === "exam" || type === "interim_test";
}

export const APPOINTMENT_TYPE_LABEL: Record<AgendaAppointmentType, string> = {
  exam: "Examen",
  interim_test: "Tussentijdse toets",
  theory_guidance: "Theoriebegeleiding",
  free_block: "Vrij blok",
  break: "Pauze",
  private_block: "Privéblokkade",
  maintenance: "Onderhoud",
  admin: "Administratie",
  vacation: "Vakantie",
};

// Short label used in compact menus/badges.
export const APPOINTMENT_TYPE_SHORT: Record<AgendaAppointmentType, string> = {
  exam: "Examen",
  interim_test: "TTT",
  theory_guidance: "Theorie",
  free_block: "Vrij blok",
  break: "Pauze",
  private_block: "Privé",
  maintenance: "Onderhoud",
  admin: "Admin",
  vacation: "Vakantie",
};

export const APPOINTMENT_VISIBILITY_LABEL: Record<AgendaVisibilityScope, string> = {
  personal: "Persoonlijk",
  shared_staff: "Met collega's",
  team: "Teamblok",
};

// Types that may be linked to a student (examen/TTT/theoriebegeleiding). The
// block types never carry a student - the DB enforces this too.
export const STUDENT_LINKED_TYPES: ReadonlySet<AgendaAppointmentType> = new Set([
  "exam",
  "interim_test",
  "theory_guidance",
]);

export function isStudentLinkedType(type: AgendaAppointmentType): boolean {
  return STUDENT_LINKED_TYPES.has(type);
}

// Block types occupy time but never carry a student.
export function isBlockType(type: AgendaAppointmentType): boolean {
  return !STUDENT_LINKED_TYPES.has(type);
}

// Visual accent per type for the agenda card (border + subtle background + text).
export const APPOINTMENT_TYPE_ACCENT: Record<AgendaAppointmentType, string> = {
  exam: "border-danger/60 bg-danger/5 text-danger",
  interim_test: "border-warning/60 bg-warning/5 text-warning",
  theory_guidance: "border-info/60 bg-info/5 text-info",
  free_block: "border-border bg-muted/40 text-muted-foreground",
  break: "border-border bg-muted/40 text-muted-foreground",
  private_block: "border-border bg-muted/40 text-muted-foreground",
  maintenance: "border-border bg-muted/40 text-muted-foreground",
  admin: "border-border bg-muted/40 text-muted-foreground",
  vacation: "border-border bg-muted/40 text-muted-foreground",
};

export type AgendaAppointment = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  instructor_id: string;
  team_id: string | null;
  visibility_scope: AgendaVisibilityScope;
  participant_user_ids: string[];
  student_id: string | null;
  type: AgendaAppointmentType;
  status: AgendaAppointmentStatus;
  starts_at: string;
  ends_at: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  color_override: string | null;
  result: AgendaAppointmentResult | null;
  result_note: string | null;
  result_recorded_at: string | null;
  result_recorded_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// Common duration presets (minutes) offered in the appointment form.
export const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90, 120, 240, 480] as const;

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
  );
}
