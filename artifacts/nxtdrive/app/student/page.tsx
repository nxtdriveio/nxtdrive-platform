import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { NextLessonCard } from "@/components/student/NextLessonCard";
import { CreditSummaryCard } from "@/components/student/CreditSummaryCard";
import { QuickActions } from "@/components/student/QuickActions";
import { StudentTheoryHomeworkCard } from "@/components/student/TheoryHomeworkCard";
import { getActiveStudent } from "@/lib/students/access";
import { RefillInvitations } from "@/components/student/refill-invitations";
import { ExamInvitations } from "@/components/student/exam-invitations";
import { listOpenInvitationsForStudent } from "@/lib/lesson-refill/invitations";
import { listOpenExamInvitationsForStudent } from "@/lib/exam-invitations/invitations";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadStudentTheoryHomework } from "@/lib/theory/data";
import { getInstructorNames } from "@/lib/students/instructor-names";
import { ReferralInvite } from "@/components/student/referral-invite";
import { ReviewRequestBanner } from "@/components/student/review-request-banner";
import {
  ensureStudentReferralCode,
  buildReferralUrl,
  loadStudentReferralSummary,
} from "@/lib/referrals/data";
import { getReviewMomentsSettings } from "@/lib/notifications/settings";
import { getPublicOrigin } from "@/lib/utils/public-origin";
import type { Lesson } from "@/lib/lessons/types";
import type { StudentCreditBreakdown } from "@/lib/students/types";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h1 className="text-xl font-semibold text-foreground">
            Welkom bij {tenant.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Je account is nog niet gekoppeld aan een leerlingdossier. Neem
            contact op met je rijschool om dit in orde te maken.
          </p>
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  // Volgende les: eerste geplande les ≥ nu.
  const { data: nextRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", student.id)
    .eq("status", "planned")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextLesson = (nextRaw as Lesson | null) ?? null;

  const [breakdownRes, homework, refillInvitations] = await Promise.all([
    supabase
      .from("student_credit_breakdown")
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle(),
    loadStudentTheoryHomework(supabase, tenant.id, student.id),
    listOpenInvitationsForStudent(supabase, tenant.id, student.id),
  ]);
  const breakdown = breakdownRes.data as StudentCreditBreakdown | null;

  // Exam invitations: the exam appointment is not yet linked to the student, so
  // it is not RLS-readable by the student until they confirm. Ownership is
  // already established above (getActiveStudent → student.id), so resolve open
  // invitations with a service-role client bounded to this tenant + student.
  const examInvitations = await listOpenExamInvitationsForStudent(
    createServiceRoleClient(),
    tenant.id,
    student.id,
  );

  const instructorNames = nextLesson
    ? await getInstructorNames([nextLesson.instructor_id])
    : new Map<string, string>();

  // Task #113 — persoonlijke referrallink (idempotent aangemaakt) + de ongelezen
  // reviewbanner. De referralcode loopt via de service-role RPC (actor = ingelogde
  // gebruiker; de RPC autoriseert leerling/voogd zelf). De notificatie wordt via de
  // anon-client gelezen zodat RLS "eigen rijen" afdwingt.
  const service = createServiceRoleClient();
  const [origin, referralCode, reviewSettings, referralSummary] =
    await Promise.all([
      getPublicOrigin(),
      ensureStudentReferralCode(service, tenant.id, student.id, user.id),
      getReviewMomentsSettings(service, tenant.id),
      loadStudentReferralSummary(service, tenant.id, student.id),
    ]);
  const referralUrl = referralCode
    ? buildReferralUrl(origin, tenant.slug, referralCode)
    : null;

  const { data: reviewNotif } = await supabase
    .from("app_notifications")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("type", "review_request")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const reviewNotificationId = (reviewNotif?.id as string | undefined) ?? null;

  const firstName = student.full_name.split(" ")[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welkom terug, {firstName}! 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hier vind je je volgende les, je tegoed en alles wat je snel wilt
          regelen.
        </p>
      </div>

      {reviewNotificationId ? (
        <ReviewRequestBanner
          notificationId={reviewNotificationId}
          reviewUrl={reviewSettings.googleReviewUrl}
        />
      ) : null}

      <RefillInvitations invitations={refillInvitations} />

      <ExamInvitations invitations={examInvitations} />

      <NextLessonCard
        lessonId={nextLesson?.id ?? null}
        startsAt={nextLesson?.starts_at ?? null}
        endsAt={nextLesson?.ends_at ?? null}
        location={nextLesson?.location ?? null}
        instructorName={
          nextLesson ? (instructorNames.get(nextLesson.instructor_id) ?? null) : null
        }
      />

      <CreditSummaryCard
        availableMinutes={breakdown?.available_minutes ?? 0}
        purchasedMinutes={breakdown?.purchased_minutes ?? 0}
      />

      <QuickActions />

      <StudentTheoryHomeworkCard homework={homework} emptyHint={false} />

      {referralUrl ? (
        <ReferralInvite
          url={referralUrl}
          schoolName={tenant.name}
          summary={referralSummary}
        />
      ) : null}
    </div>
  );
}
