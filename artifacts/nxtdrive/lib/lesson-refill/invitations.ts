import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Task #93 — read helpers for refill invitations (wachtlijst). All mutations go
// through the SECURITY DEFINER RPCs (create/respond/cancel); this module only
// reads, relying on the select-only RLS on lesson_refill_invitations (staff in
// tenant / own student / own guardian).
// ---------------------------------------------------------------------------

export type RefillInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export type RefillInvitation = {
  id: string;
  tenantId: string;
  studentId: string;
  instructorId: string;
  sourceLessonId: string | null;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  location: string | null;
  status: RefillInvitationStatus;
  expiresAt: string;
  score: number;
  reason: string | null;
  bookedLessonId: string | null;
  respondedAt: string | null;
  createdAt: string;
};

type InvitationRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  instructor_id: string;
  source_lesson_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  location: string | null;
  status: RefillInvitationStatus;
  expires_at: string;
  score: number;
  reason: string | null;
  booked_lesson_id: string | null;
  responded_at: string | null;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, tenant_id, student_id, instructor_id, source_lesson_id, starts_at, ends_at, duration_min, location, status, expires_at, score, reason, booked_lesson_id, responded_at, created_at";

function mapRow(row: InvitationRow): RefillInvitation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    instructorId: row.instructor_id,
    sourceLessonId: row.source_lesson_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMin: row.duration_min,
    location: row.location,
    status: row.status,
    expiresAt: row.expires_at,
    score: row.score,
    reason: row.reason,
    bookedLessonId: row.booked_lesson_id,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
  };
}

/**
 * Whether a pending invitation is still actionable right now (not lazily
 * expired). The RPCs enforce this authoritatively; this is a UI-side helper so
 * the student/staff views do not offer stale invitations.
 */
export function isInvitationActionable(
  inv: Pick<RefillInvitation, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  return inv.status === "pending" && new Date(inv.expiresAt).getTime() > now.getTime();
}

/**
 * Open (pending, not expired) invitations for a single student, soonest first.
 * Used by the student PWA to surface invitations awaiting a response.
 */
export async function listOpenInvitationsForStudent(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<RefillInvitation[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("lesson_refill_invitations")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("starts_at", { ascending: true });
  if (error || !data) return [];
  return (data as InvitationRow[]).map(mapRow);
}

/**
 * All open (pending, not expired) invitations tied to a specific freed block,
 * identified by its source lesson. Used by the backoffice to show who has been
 * invited for that slot and enforce the max-concurrent rule in the UI.
 */
export async function listOpenInvitationsForSlot(
  client: SupabaseClient,
  tenantId: string,
  sourceLessonId: string,
): Promise<RefillInvitation[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("lesson_refill_invitations")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("source_lesson_id", sourceLessonId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("score", { ascending: false });
  if (error || !data) return [];
  return (data as InvitationRow[]).map(mapRow);
}
