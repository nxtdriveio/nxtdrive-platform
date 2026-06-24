import type { SupabaseClient } from "@supabase/supabase-js";

export type SlotRecoveryInvitation = {
  id: string;
  tenantId: string;
  bookingRequestId: string;
  studentId: string;
  instructorId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  location: string | null;
  status: "generated" | "selected" | "held" | "rejected" | "expired" | "confirmed";
  score: number;
  reason: string | null;
  expiresAt: string | null;
  interestShown: boolean;
};

type CandidateRow = {
  id: string;
  tenant_id: string;
  booking_request_id: string;
  candidate_student_id: string;
  instructor_id: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  pickup_location: string | null;
  status: SlotRecoveryInvitation["status"];
  score: number;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  booking_candidate_preferences?: Array<{ id: string; status: string }> | null;
};

const SELECT_COLUMNS = `
  id,
  tenant_id,
  booking_request_id,
  candidate_student_id,
  instructor_id,
  starts_at,
  ends_at,
  duration_min,
  pickup_location,
  status,
  score,
  reason,
  metadata,
  booking_candidate_preferences(id, status)
`;

function stringFromMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapRow(row: CandidateRow): SlotRecoveryInvitation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    bookingRequestId: row.booking_request_id,
    studentId: row.candidate_student_id,
    instructorId: row.instructor_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMin: row.duration_min,
    location: row.pickup_location,
    status: row.status,
    score: row.score,
    reason: row.reason,
    expiresAt: stringFromMetadata(row.metadata, "expires_at"),
    interestShown:
      row.status === "selected" ||
      (row.booking_candidate_preferences ?? []).some(
        (preference) => preference.status === "selected",
      ),
  };
}

export async function listOpenSlotRecoveryInvitationsForStudent(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<SlotRecoveryInvitation[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("booking_candidates")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("candidate_student_id", studentId)
    .in("status", ["generated", "selected"])
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true });
  if (error || !data) return [];

  return (data as CandidateRow[])
    .map(mapRow)
    .filter(
      (invitation) =>
        !invitation.expiresAt ||
        new Date(invitation.expiresAt).getTime() > Date.now(),
    );
}
