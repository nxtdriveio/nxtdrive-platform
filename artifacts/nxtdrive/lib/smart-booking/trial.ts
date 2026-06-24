import type { TrialSuggestion } from "@/lib/trial-lessons/types";
import type { ValidatedTrialSlot } from "@/lib/trial-lessons/suggestions";
import type { BookingCandidateInput, BookingRequestInput } from "./types";

export function trialBookingIdempotencyKey(leadId: string): string {
  return `lead:${leadId}:trial_lesson`;
}

export function trialLeadBookingRequestInput(args: {
  tenantId: string;
  branchId?: string | null;
  leadId: string;
  requestedDurationMin?: number | null;
  requiredTransmission?: string | null;
  pickupLocation?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupPlaceId?: string | null;
  pickupFormattedAddress?: string | null;
  preferredDays?: string[];
  preferredTimes?: string[];
  desiredStartDate?: string | null;
}): BookingRequestInput {
  return {
    tenantId: args.tenantId,
    branchId: args.branchId ?? null,
    source: "intake_wizard",
    requesterType: "public_lead",
    entityType: "trial_lesson",
    leadId: args.leadId,
    requestedDurationMin: args.requestedDurationMin ?? null,
    requiredTransmission: args.requiredTransmission ?? null,
    pickupLocation: args.pickupLocation ?? null,
    pickupLat: args.pickupLat ?? null,
    pickupLng: args.pickupLng ?? null,
    pickupPlaceId: args.pickupPlaceId ?? null,
    pickupFormattedAddress: args.pickupFormattedAddress ?? null,
    preferredDays: args.preferredDays ?? [],
    preferredTimes: args.preferredTimes ?? [],
    desiredStartDate: args.desiredStartDate ?? null,
    idempotencyKey: trialBookingIdempotencyKey(args.leadId),
    metadata: {
      flow: "public_intake_trial_lesson",
    },
    actor: null,
  };
}

export function trialSuggestionToBookingCandidate(
  suggestion: TrialSuggestion,
  rank: number,
): BookingCandidateInput {
  const route = suggestion.route;
  const warnings =
    route?.needs_manual_confirm === true
      ? [
          {
            code: "route_needs_manual_confirm",
            label: "Route moet handmatig worden bevestigd",
          },
        ]
      : [];

  return {
    rank,
    instructorId: suggestion.instructor_id,
    startsAt: suggestion.starts_at,
    endsAt: suggestion.ends_at,
    durationMin: suggestion.duration_min,
    pickupLocation: suggestion.pickup_location,
    pickupLat: suggestion.pickup_lat,
    pickupLng: suggestion.pickup_lng,
    pickupPlaceId: suggestion.pickup_place_id,
    pickupFormattedAddress: suggestion.pickup_formatted_address,
    score: suggestion.score,
    scoreFactors: suggestion.factors,
    warnings,
    validation: {
      generated_by: "trial_lesson_suggestions",
    },
    routeStatus: route?.status ?? null,
    routeTravelToMin: route?.travel_to_min ?? null,
    routeTravelFromMin: route?.travel_from_min ?? null,
    routeNeedsConfirm: route?.needs_manual_confirm ?? false,
    reason: suggestion.reason,
    status: "generated",
    metadata: {
      route_prev_distance_km: route?.prev_distance_km ?? null,
      route_next_distance_km: route?.next_distance_km ?? null,
    },
  };
}

export function validatedTrialSlotToBookingCandidate(
  slot: ValidatedTrialSlot,
  validation: Record<string, unknown>,
): BookingCandidateInput {
  return {
    rank: 1,
    instructorId: slot.instructorId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    durationMin: slot.durationMin,
    pickupLocation: slot.pickupLocation,
    pickupLat: slot.pickupLat,
    pickupLng: slot.pickupLng,
    pickupPlaceId: slot.pickupPlaceId,
    pickupFormattedAddress: slot.pickupFormattedAddress,
    score: slot.score,
    scoreFactors: [],
    warnings: slot.route.needs_manual_confirm
      ? [
          {
            code: "route_needs_manual_confirm",
            label: "Route moet handmatig worden bevestigd",
          },
        ]
      : [],
    validation: {
      ...validation,
      selected_by: "public_intake",
    },
    routeStatus: slot.route.status,
    routeTravelToMin: slot.route.travel_to_min,
    routeTravelFromMin: slot.route.travel_from_min,
    routeNeedsConfirm: slot.route.needs_manual_confirm,
    reason: slot.reason,
    status: "selected",
    metadata: {
      route_prev_distance_km: slot.route.prev_distance_km,
      route_next_distance_km: slot.route.next_distance_km,
    },
  };
}
