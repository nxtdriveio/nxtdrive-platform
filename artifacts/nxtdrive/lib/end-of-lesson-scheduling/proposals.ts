import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentNextLessonProposal = {
  confirmationId: string;
  candidateId: string;
  requestId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  location: string | null;
  reason: string | null;
  expiresAt: string | null;
};

type ProposalRow = {
  id: string;
  booking_request_id: string;
  booking_candidate_id: string;
  expires_at: string | null;
  booking_candidates:
    | {
    id: string;
    starts_at: string;
    ends_at: string;
    duration_min: number;
    pickup_location: string | null;
    reason: string | null;
  }
    | Array<{
        id: string;
        starts_at: string;
        ends_at: string;
        duration_min: number;
        pickup_location: string | null;
        reason: string | null;
      }>
    | null;
  booking_requests:
    | {
    source: string;
    student_id: string | null;
    status: string;
  }
    | Array<{ source: string; student_id: string | null; status: string }>
    | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function listOpenNextLessonProposalsForStudent(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentNextLessonProposal[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("booking_confirmations")
    .select(
      `
        id,
        booking_request_id,
        booking_candidate_id,
        expires_at,
        booking_candidates (
          id,
          starts_at,
          ends_at,
          duration_min,
          pickup_location,
          reason
        ),
        booking_requests (
          source,
          student_id,
          status
        )
      `,
    )
    .eq("tenant_id", tenantId)
    .eq("actor_type", "student")
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true });
  if (error || !data) return [];

  return (data as unknown as ProposalRow[])
    .map((row) => ({
      row,
      request: firstRelation(row.booking_requests),
      candidate: firstRelation(row.booking_candidates),
    }))
    .filter(
      ({ request, candidate }) =>
        request?.source === "instructor_next_lesson" &&
        request.student_id === studentId &&
        request.status !== "confirmed" &&
        Boolean(candidate) &&
        new Date(candidate!.starts_at).getTime() > Date.now(),
    )
    .map(({ row, candidate }) => ({
      confirmationId: row.id,
      candidateId: row.booking_candidate_id,
      requestId: row.booking_request_id,
      startsAt: candidate!.starts_at,
      endsAt: candidate!.ends_at,
      durationMin: candidate!.duration_min,
      location: candidate!.pickup_location,
      reason: candidate!.reason,
      expiresAt: row.expires_at,
    }));
}
