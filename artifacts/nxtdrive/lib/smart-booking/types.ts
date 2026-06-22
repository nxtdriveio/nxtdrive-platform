export const BOOKING_REQUEST_SOURCES = [
  "intake_wizard",
  "embedded_widget",
  "student_self_book",
  "student_reschedule",
  "slot_recovery",
  "instructor_next_lesson",
  "backoffice",
  "system",
] as const;

export type BookingRequestSource = (typeof BOOKING_REQUEST_SOURCES)[number];

export const BOOKING_REQUESTER_TYPES = [
  "public_lead",
  "student",
  "guardian",
  "staff",
  "system",
] as const;

export type BookingRequesterType = (typeof BOOKING_REQUESTER_TYPES)[number];

export const BOOKING_ENTITY_TYPES = [
  "trial_lesson",
  "lesson",
  "agenda_appointment",
] as const;

export type BookingEntityType = (typeof BOOKING_ENTITY_TYPES)[number];

export type BookingRequestInput = {
  tenantId: string;
  branchId?: string | null;
  source: BookingRequestSource;
  requesterType: BookingRequesterType;
  entityType: BookingEntityType;
  leadId?: string | null;
  studentId?: string | null;
  requestedDurationMin?: number | null;
  requiredTransmission?: string | null;
  preferredInstructorId?: string | null;
  pickupLocation?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupPlaceId?: string | null;
  pickupFormattedAddress?: string | null;
  preferredDays?: string[];
  preferredTimes?: string[];
  desiredStartDate?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
  actor?: string | null;
};

export type BookingCandidateInput = {
  rank: number;
  instructorId: string;
  vehicleId?: string | null;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  pickupLocation?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupPlaceId?: string | null;
  pickupFormattedAddress?: string | null;
  score?: number;
  scoreFactors?: unknown[];
  warnings?: unknown[];
  blockingReasons?: unknown[];
  validation?: Record<string, unknown>;
  routeStatus?: "computed" | "estimated" | "unavailable" | null;
  routeTravelToMin?: number | null;
  routeTravelFromMin?: number | null;
  routeNeedsConfirm?: boolean;
  reason?: string | null;
  status?: "generated" | "selected" | "held" | "rejected" | "expired" | "confirmed";
  metadata?: Record<string, unknown>;
};

export type BookingCandidatePreferenceInput = {
  bookingCandidateId: string;
  preferenceRank: number;
  requesterType?: BookingRequesterType;
  selectedByUserId?: string | null;
  status?: "selected" | "confirmed";
  metadata?: Record<string, unknown>;
};

export type BookingCandidateLookup = {
  tenantId: string;
  bookingRequestId: string;
  instructorId: string;
  startsAt: string;
  endsAt?: string | null;
};

export type BookingHoldInput = {
  tenantId: string;
  bookingRequestId: string;
  bookingCandidateId: string;
  actor?: string | null;
  expiresAt: string;
  holdTokenHash?: string | null;
};

export type BookingConfirmationActorType =
  | "backoffice"
  | "instructor"
  | "student"
  | "tenant_admin"
  | "system";

export type BookingConfirmationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export type BookingConfirmationInput = {
  tenantId: string;
  bookingRequestId: string;
  bookingCandidateId: string;
  actor?: string | null;
  requiresBackoffice?: boolean;
  requiresInstructor?: boolean;
  requiresStudent?: boolean;
  backofficeExpiresAt?: string | null;
  instructorExpiresAt?: string | null;
  studentExpiresAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type BookingConfirmationResponse = {
  tenantId: string;
  bookingConfirmationId: string;
  actor?: string | null;
  response: "accepted" | "declined";
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type BookingConfirmationView = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  booking_request_id: string;
  booking_candidate_id: string;
  booking_hold_id: string | null;
  actor_type: BookingConfirmationActorType;
  actor_user_id: string | null;
  status: BookingConfirmationStatus;
  required: boolean;
  expires_at: string;
  responded_at: string | null;
  response_reason: string | null;
  metadata: Record<string, unknown>;
};

export type BookingCandidatePreferenceView = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  booking_request_id: string;
  booking_candidate_id: string;
  preference_rank: number;
  requester_type: BookingRequesterType;
  selected_by_user_id: string | null;
  status: "selected" | "superseded" | "confirmed" | "expired" | "cancelled";
  selected_at: string;
  metadata: Record<string, unknown>;
  booking_candidates: {
    id: string;
    instructor_id: string;
    starts_at: string;
    ends_at: string;
    duration_min: number;
    pickup_location: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    pickup_place_id: string | null;
    pickup_formatted_address: string | null;
    score: number;
    score_factors: unknown[];
    warnings: unknown[];
    route_status: "computed" | "estimated" | "unavailable" | null;
    route_travel_to_min: number | null;
    route_travel_from_min: number | null;
    route_needs_confirm: boolean;
    reason: string | null;
    status: string;
  } | null;
};
