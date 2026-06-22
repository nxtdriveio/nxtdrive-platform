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
