import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BookingCandidateInput,
  BookingCandidateLookup,
  BookingHoldInput,
  BookingRequestInput,
  BookingEntityType,
} from "./types";

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} RPC did not return an id.`);
  }
  return value;
}

function rpcError(label: string, error: unknown): Error {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : "Unknown Supabase RPC error.";
  return new Error(`${label} failed: ${message}`);
}

export async function ensureBookingRequest(
  service: SupabaseClient,
  input: BookingRequestInput,
): Promise<string> {
  const { data, error } = await service.rpc("create_booking_request", {
    p_tenant_id: input.tenantId,
    p_branch_id: input.branchId ?? null,
    p_source: input.source,
    p_requester_type: input.requesterType,
    p_entity_type: input.entityType,
    p_lead_id: input.leadId ?? null,
    p_student_id: input.studentId ?? null,
    p_requested_duration_min: input.requestedDurationMin ?? null,
    p_required_transmission: input.requiredTransmission ?? null,
    p_preferred_instructor_id: input.preferredInstructorId ?? null,
    p_pickup_location: input.pickupLocation ?? null,
    p_pickup_lat: input.pickupLat ?? null,
    p_pickup_lng: input.pickupLng ?? null,
    p_pickup_place_id: input.pickupPlaceId ?? null,
    p_pickup_formatted_address: input.pickupFormattedAddress ?? null,
    p_preferred_days: input.preferredDays ?? [],
    p_preferred_times: input.preferredTimes ?? [],
    p_desired_start_date: input.desiredStartDate ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_metadata: input.metadata ?? {},
    p_actor: input.actor ?? null,
  });

  if (error) throw rpcError("create_booking_request", error);
  return assertString(data, "create_booking_request");
}

function serializeCandidate(candidate: BookingCandidateInput) {
  return {
    rank: candidate.rank,
    instructor_id: candidate.instructorId,
    vehicle_id: candidate.vehicleId ?? null,
    starts_at: candidate.startsAt,
    ends_at: candidate.endsAt,
    duration_min: candidate.durationMin,
    pickup_location: candidate.pickupLocation ?? null,
    pickup_lat: candidate.pickupLat ?? null,
    pickup_lng: candidate.pickupLng ?? null,
    pickup_place_id: candidate.pickupPlaceId ?? null,
    pickup_formatted_address: candidate.pickupFormattedAddress ?? null,
    score: candidate.score ?? 0,
    score_factors: candidate.scoreFactors ?? [],
    warnings: candidate.warnings ?? [],
    blocking_reasons: candidate.blockingReasons ?? [],
    validation: candidate.validation ?? {},
    route_status: candidate.routeStatus ?? null,
    route_travel_to_min: candidate.routeTravelToMin ?? null,
    route_travel_from_min: candidate.routeTravelFromMin ?? null,
    route_needs_confirm: candidate.routeNeedsConfirm ?? false,
    reason: candidate.reason ?? null,
    status: candidate.status ?? "generated",
    metadata: candidate.metadata ?? {},
  };
}

export async function replaceBookingCandidates(
  service: SupabaseClient,
  args: {
    tenantId: string;
    bookingRequestId: string;
    actor?: string | null;
    candidates: BookingCandidateInput[];
  },
): Promise<number> {
  const { data, error } = await service.rpc("replace_booking_candidates", {
    p_booking_request_id: args.bookingRequestId,
    p_tenant_id: args.tenantId,
    p_actor: args.actor ?? null,
    p_candidates: args.candidates.map(serializeCandidate),
  });

  if (error) throw rpcError("replace_booking_candidates", error);
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function findBookingCandidateBySlot(
  service: SupabaseClient,
  lookup: BookingCandidateLookup,
): Promise<string | null> {
  let query = service
    .from("booking_candidates")
    .select("id")
    .eq("tenant_id", lookup.tenantId)
    .eq("booking_request_id", lookup.bookingRequestId)
    .eq("instructor_id", lookup.instructorId)
    .eq("starts_at", lookup.startsAt)
    .order("created_at", { ascending: false })
    .limit(1);

  if (lookup.endsAt) query = query.eq("ends_at", lookup.endsAt);

  const { data, error } = await query.maybeSingle();
  if (error) throw rpcError("booking_candidates lookup", error);
  return typeof data?.id === "string" ? data.id : null;
}

export async function createBookingHold(
  service: SupabaseClient,
  input: BookingHoldInput,
): Promise<string> {
  const { data, error } = await service.rpc("create_booking_hold", {
    p_booking_request_id: input.bookingRequestId,
    p_booking_candidate_id: input.bookingCandidateId,
    p_tenant_id: input.tenantId,
    p_actor: input.actor ?? null,
    p_expires_at: input.expiresAt,
    p_hold_token_hash: input.holdTokenHash ?? null,
  });

  if (error) throw rpcError("create_booking_hold", error);
  return assertString(data, "create_booking_hold");
}

export async function releaseBookingHold(
  service: SupabaseClient,
  args: {
    tenantId: string;
    bookingHoldId: string;
    actor?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await service.rpc("release_booking_hold", {
    p_booking_hold_id: args.bookingHoldId,
    p_tenant_id: args.tenantId,
    p_actor: args.actor ?? null,
    p_reason: args.reason ?? null,
  });
  if (error) throw rpcError("release_booking_hold", error);
}

export async function completeBookingHold(
  service: SupabaseClient,
  args: {
    tenantId: string;
    bookingHoldId: string;
    actor?: string | null;
    confirmedEntityType: BookingEntityType;
    confirmedEntityId: string;
  },
): Promise<void> {
  const { error } = await service.rpc("complete_booking_hold", {
    p_booking_hold_id: args.bookingHoldId,
    p_tenant_id: args.tenantId,
    p_actor: args.actor ?? null,
    p_confirmed_entity_type: args.confirmedEntityType,
    p_confirmed_entity_id: args.confirmedEntityId,
  });
  if (error) throw rpcError("complete_booking_hold", error);
}
