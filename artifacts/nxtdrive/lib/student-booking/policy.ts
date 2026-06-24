import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
export {
  DEFAULT_STUDENT_SELF_BOOKING_POLICY,
  STUDENT_SELF_BOOKING_POLICY_KEY,
  type StudentSelfBookingPolicy,
} from "./policy-shared";
import {
  DEFAULT_STUDENT_SELF_BOOKING_POLICY,
  STUDENT_SELF_BOOKING_POLICY_KEY,
  type StudentSelfBookingPolicy,
} from "./policy-shared";

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function mergeStudentSelfBookingPolicy(
  value: unknown,
): StudentSelfBookingPolicy {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    self_booking_enabled: boolValue(
      source.self_booking_enabled,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.self_booking_enabled,
    ),
    students_can_book_lessons: boolValue(
      source.students_can_book_lessons,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.students_can_book_lessons,
    ),
    students_can_reschedule_lessons: boolValue(
      source.students_can_reschedule_lessons,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.students_can_reschedule_lessons,
    ),
    students_can_cancel_lessons: boolValue(
      source.students_can_cancel_lessons,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.students_can_cancel_lessons,
    ),
    manual_approval_required: boolValue(
      source.manual_approval_required,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.manual_approval_required,
    ),
    instructor_approval_required: boolValue(
      source.instructor_approval_required,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.instructor_approval_required,
    ),
    student_final_confirmation_required: boolValue(
      source.student_final_confirmation_required,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.student_final_confirmation_required,
    ),
    allow_booking_with_unpaid_invoice: boolValue(
      source.allow_booking_with_unpaid_invoice,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.allow_booking_with_unpaid_invoice,
    ),
    allow_booking_without_sufficient_credit: boolValue(
      source.allow_booking_without_sufficient_credit,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.allow_booking_without_sufficient_credit,
    ),
    max_future_bookings_per_student: numberValue(
      source.max_future_bookings_per_student,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.max_future_bookings_per_student,
      1,
      50,
    ),
    max_lessons_per_week: numberValue(
      source.max_lessons_per_week,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.max_lessons_per_week,
      1,
      21,
    ),
    min_notice_hours_for_booking: numberValue(
      source.min_notice_hours_for_booking,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.min_notice_hours_for_booking,
      0,
      8760,
    ),
    booking_window_days: numberValue(
      source.booking_window_days,
      DEFAULT_STUDENT_SELF_BOOKING_POLICY.booking_window_days,
      1,
      365,
    ),
  };
}

export async function loadStudentSelfBookingPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<StudentSelfBookingPolicy> {
  const { data } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", STUDENT_SELF_BOOKING_POLICY_KEY)
    .maybeSingle();

  return mergeStudentSelfBookingPolicy(data?.value);
}
