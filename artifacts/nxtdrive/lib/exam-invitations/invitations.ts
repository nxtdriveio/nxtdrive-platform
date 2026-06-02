import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamSlotType } from "@/lib/lesson-planning/exam-candidates";

// ---------------------------------------------------------------------------
// Task #102 — read helpers for the examenmoment-invitation flow. Writes always
// go through the service-role RPC's (0068). These helpers only read, scoped to a
// tenant. The student-facing list resolves the appointment details via the
// passed client (service role on the student page, because the exam appointment
// is not yet linked to the student and therefore not RLS-readable by them).
// ---------------------------------------------------------------------------

export type ExamInvitationStatus =
  | "invited"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled";

export type ExamInvitationRow = {
  id: string;
  tenant_id: string;
  appointment_id: string;
  student_id: string;
  status: ExamInvitationStatus;
  expires_at: string;
  score: number;
  reason: string | null;
  created_by: string | null;
  responded_at: string | null;
  created_at: string;
};

export function mapExamInvitationRow(raw: Record<string, unknown>): ExamInvitationRow {
  return {
    id: String(raw.id),
    tenant_id: String(raw.tenant_id),
    appointment_id: String(raw.appointment_id),
    student_id: String(raw.student_id),
    status: raw.status as ExamInvitationStatus,
    expires_at: String(raw.expires_at),
    score: typeof raw.score === "number" ? raw.score : Number(raw.score ?? 0),
    reason: (raw.reason as string | null) ?? null,
    created_by: (raw.created_by as string | null) ?? null,
    responded_at: (raw.responded_at as string | null) ?? null,
    created_at: String(raw.created_at),
  };
}

/**
 * An invitation can still be acted upon (confirmed/declined) only while it is
 * 'invited' AND not past its expiry. Mirrors the RPC's lazy-expiry guard so the
 * UI never offers a button the RPC would reject.
 */
export function isExamInvitationActionable(row: ExamInvitationRow): boolean {
  return row.status === "invited" && new Date(row.expires_at).getTime() > Date.now();
}

// --- Student PWA view -------------------------------------------------------

export type StudentExamInvitation = {
  id: string;
  status: ExamInvitationStatus;
  score: number;
  reason: string | null;
  expiresAt: string;
  appointment: {
    id: string;
    type: ExamSlotType;
    startsAt: string;
    endsAt: string;
    location: string | null;
    instructorName: string | null;
  };
};

/**
 * Open ('invited', not expired) exam invitations for a single student, enriched
 * with the appointment moment + instructor name. The exam appointment is not
 * yet linked to the student, so pass a service-role client here — ownership is
 * already established by the caller (it resolves student.id via getActiveStudent).
 */
export async function listOpenExamInvitationsForStudent(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentExamInvitation[]> {
  const { data, error } = await client
    .from("exam_invitations")
    .select("id, status, score, reason, expires_at, appointment_id")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("status", "invited")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error || !data || data.length === 0) return [];

  const appointmentIds = Array.from(
    new Set(data.map((r) => String(r.appointment_id))),
  );
  const { data: appts } = await client
    .from("agenda_appointments")
    .select("id, type, starts_at, ends_at, location, instructor_id")
    .eq("tenant_id", tenantId)
    .in("id", appointmentIds);
  const apptById = new Map(
    (appts ?? []).map((a) => [String(a.id), a as Record<string, unknown>]),
  );

  const instructorIds = Array.from(
    new Set(
      (appts ?? [])
        .map((a) => (a.instructor_id as string | null) ?? null)
        .filter((id): id is string => !!id),
    ),
  );
  const instructorById = new Map<string, string>();
  if (instructorIds.length > 0) {
    const { data: profiles } = await client
      .from("profiles")
      .select("id, full_name")
      .in("id", instructorIds);
    for (const p of profiles ?? []) {
      instructorById.set(String(p.id), (p.full_name as string | null) ?? "");
    }
  }

  const result: StudentExamInvitation[] = [];
  for (const r of data) {
    const appt = apptById.get(String(r.appointment_id));
    if (!appt) continue; // appointment gone → nothing to confirm
    const instructorId = (appt.instructor_id as string | null) ?? null;
    result.push({
      id: String(r.id),
      status: r.status as ExamInvitationStatus,
      score: typeof r.score === "number" ? r.score : Number(r.score ?? 0),
      reason: (r.reason as string | null) ?? null,
      expiresAt: String(r.expires_at),
      appointment: {
        id: String(appt.id),
        type: appt.type as ExamSlotType,
        startsAt: String(appt.starts_at),
        endsAt: String(appt.ends_at),
        location: (appt.location as string | null) ?? null,
        instructorName: instructorId
          ? instructorById.get(instructorId) || null
          : null,
      },
    });
  }
  return result;
}

// --- Backoffice view (per exam moment) --------------------------------------

export type AppointmentExamInvitation = {
  id: string;
  studentId: string;
  studentName: string;
  status: ExamInvitationStatus;
  score: number;
  reason: string | null;
  expiresAt: string;
  respondedAt: string | null;
  expired: boolean;
};

// Internal: enrich raw exam_invitation rows with student names + derived expiry.
async function enrichAppointmentInvitations(
  client: SupabaseClient,
  tenantId: string,
  rows: Record<string, unknown>[],
): Promise<AppointmentExamInvitation[]> {
  if (rows.length === 0) return [];
  const studentIds = Array.from(new Set(rows.map((r) => String(r.student_id))));
  const { data: students } = await client
    .from("students")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("id", studentIds);
  const nameById = new Map(
    (students ?? []).map((s) => [
      String(s.id),
      (s.full_name as string | null) ?? "",
    ]),
  );

  const now = Date.now();
  return rows.map((r) => ({
    id: String(r.id),
    studentId: String(r.student_id),
    studentName: nameById.get(String(r.student_id)) || "Onbekende leerling",
    status: r.status as ExamInvitationStatus,
    score: typeof r.score === "number" ? r.score : Number(r.score ?? 0),
    reason: (r.reason as string | null) ?? null,
    expiresAt: String(r.expires_at),
    respondedAt: (r.responded_at as string | null) ?? null,
    expired: new Date(String(r.expires_at)).getTime() <= now,
  }));
}

/**
 * Open ('invited') exam invitations for a single appointment, with student
 * names, for the backoffice management section. Staff can read both
 * exam_invitations and students under RLS, so the staff server client is fine.
 */
export async function listOpenExamInvitationsForAppointment(
  client: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentExamInvitation[]> {
  const { data, error } = await client
    .from("exam_invitations")
    .select("id, student_id, status, score, reason, expires_at, responded_at")
    .eq("tenant_id", tenantId)
    .eq("appointment_id", appointmentId)
    .eq("status", "invited")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return enrichAppointmentInvitations(client, tenantId, data);
}

/**
 * Resolved (responded-to) exam invitations for a single appointment — the
 * backoffice status history so staff see who confirmed, declined or had their
 * invitation cancelled. Most-recent response first. Staff RLS client is fine.
 */
export async function listResolvedExamInvitationsForAppointment(
  client: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentExamInvitation[]> {
  const { data, error } = await client
    .from("exam_invitations")
    .select("id, student_id, status, score, reason, expires_at, responded_at")
    .eq("tenant_id", tenantId)
    .eq("appointment_id", appointmentId)
    .in("status", ["confirmed", "declined", "cancelled"])
    .order("responded_at", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return enrichAppointmentInvitations(client, tenantId, data);
}
