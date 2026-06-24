import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCancellationPolicy } from "@/lib/lessons/cancellation-policy";
import {
  refundPctForHours,
  type CancellationPolicy,
  type Lesson,
} from "@/lib/lessons/types";
import { loadStudentSelfBookingPolicy } from "@/lib/student-booking/policy";

type LatestPackageRules = {
  name: string;
  rescheduling_allowed: boolean;
  cancellation_allowed: boolean;
} | null;

export type LessonSelfServicePreview = {
  isFuturePlanned: boolean;
  hoursBefore: number;
  minNoticeHours: number;
  cancellationPolicy: CancellationPolicy | null;
  refundPct: number;
  refundCredits: number;
  canCancel: boolean;
  canReschedule: boolean;
  cancelBlockedReason: string | null;
  rescheduleBlockedReason: string | null;
  latestPackage: LatestPackageRules;
};

async function loadLatestPackageRules(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<LatestPackageRules> {
  const { data: ledgerRow } = await client
    .from("credit_ledger")
    .select("related_id")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("reason", "package_purchase")
    .eq("related_type", "package")
    .gt("delta", 0)
    .not("related_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const packageId =
    typeof ledgerRow?.related_id === "string" ? ledgerRow.related_id : null;
  if (!packageId) return null;

  const { data } = await client
    .from("packages")
    .select("name, rescheduling_allowed, cancellation_allowed")
    .eq("tenant_id", tenantId)
    .eq("id", packageId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: String(data.name ?? "Pakket"),
    rescheduling_allowed: data.rescheduling_allowed !== false,
    cancellation_allowed: data.cancellation_allowed !== false,
  };
}

export async function loadLessonSelfServicePreview(
  client: SupabaseClient,
  tenantId: string,
  lesson: Lesson,
): Promise<LessonSelfServicePreview> {
  const hoursBefore = Math.max(
    0,
    (new Date(lesson.starts_at).getTime() - Date.now()) / 3_600_000,
  );
  const isFuturePlanned = lesson.status === "planned" && hoursBefore > 0;
  const [cancellationPolicy, bookingPolicy, latestPackage] = await Promise.all([
    isFuturePlanned ? loadCancellationPolicy(client, tenantId) : Promise.resolve(null),
    loadStudentSelfBookingPolicy(client, tenantId),
    loadLatestPackageRules(client, tenantId, lesson.student_id),
  ]);
  const minNoticeHours = cancellationPolicy?.min_notice_hours ?? 0;
  const refundPct = cancellationPolicy
    ? refundPctForHours(cancellationPolicy, hoursBefore)
    : 0;
  const refundCredits = Math.max(
    0,
    Math.min(
      lesson.credits_cost,
      Math.round((lesson.credits_cost * refundPct) / 100),
    ),
  );

  let cancelBlockedReason: string | null = null;
  let rescheduleBlockedReason: string | null = null;

  if (!isFuturePlanned) {
    cancelBlockedReason = "Deze les is niet meer zelf te wijzigen.";
    rescheduleBlockedReason = cancelBlockedReason;
  } else if (hoursBefore < minNoticeHours) {
    const reason = `Dit kan tot uiterlijk ${minNoticeHours} uur van tevoren.`;
    cancelBlockedReason = reason;
    rescheduleBlockedReason = reason;
  }

  if (!bookingPolicy.students_can_cancel_lessons) {
    cancelBlockedReason = "Zelf annuleren staat uit voor jouw rijschool.";
  }
  if (!bookingPolicy.students_can_reschedule_lessons) {
    rescheduleBlockedReason = "Zelf verzetten staat uit voor jouw rijschool.";
  }
  if (latestPackage && !latestPackage.cancellation_allowed) {
    cancelBlockedReason = `Je huidige pakket (${latestPackage.name}) staat zelf annuleren niet toe.`;
  }
  if (latestPackage && !latestPackage.rescheduling_allowed) {
    rescheduleBlockedReason = `Je huidige pakket (${latestPackage.name}) staat zelf verzetten niet toe.`;
  }

  return {
    isFuturePlanned,
    hoursBefore,
    minNoticeHours,
    cancellationPolicy,
    refundPct,
    refundCredits,
    canCancel: isFuturePlanned && cancelBlockedReason === null,
    canReschedule: isFuturePlanned && rescheduleBlockedReason === null,
    cancelBlockedReason,
    rescheduleBlockedReason,
    latestPackage,
  };
}
