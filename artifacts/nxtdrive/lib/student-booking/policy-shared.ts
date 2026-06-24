export const STUDENT_SELF_BOOKING_POLICY_KEY = "student_self_booking_policy";

export type StudentSelfBookingPolicy = {
  self_booking_enabled: boolean;
  students_can_book_lessons: boolean;
  students_can_reschedule_lessons: boolean;
  students_can_cancel_lessons: boolean;
  manual_approval_required: boolean;
  instructor_approval_required: boolean;
  student_final_confirmation_required: boolean;
  allow_booking_with_unpaid_invoice: boolean;
  allow_booking_without_sufficient_credit: boolean;
  max_future_bookings_per_student: number;
  max_lessons_per_week: number;
  min_notice_hours_for_booking: number;
  booking_window_days: number;
};

export const DEFAULT_STUDENT_SELF_BOOKING_POLICY: StudentSelfBookingPolicy = {
  self_booking_enabled: false,
  students_can_book_lessons: false,
  students_can_reschedule_lessons: true,
  students_can_cancel_lessons: true,
  manual_approval_required: false,
  instructor_approval_required: false,
  student_final_confirmation_required: false,
  allow_booking_with_unpaid_invoice: false,
  allow_booking_without_sufficient_credit: false,
  max_future_bookings_per_student: 2,
  max_lessons_per_week: 2,
  min_notice_hours_for_booking: 24,
  booking_window_days: 30,
};
