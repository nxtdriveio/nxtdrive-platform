import { redirect } from "next/navigation";
import { ADVICE_LABELS, PHASE_LABELS } from "@workspace/leskaart";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveStudent } from "@/lib/students/access";
import { RefillInvitations } from "@/components/student/refill-invitations";
import { SlotRecoveryInvitations } from "@/components/student/slot-recovery-invitations";
import { NextLessonProposals } from "@/components/student/next-lesson-proposals";
import { ExamInvitations } from "@/components/student/exam-invitations";
import { listOpenInvitationsForStudent } from "@/lib/lesson-refill/invitations";
import { listOpenSlotRecoveryInvitationsForStudent } from "@/lib/slot-recovery/invitations";
import { listOpenNextLessonProposalsForStudent } from "@/lib/end-of-lesson-scheduling/proposals";
import { listOpenExamInvitationsForStudent } from "@/lib/exam-invitations/invitations";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ReferralInvite } from "@/components/student/referral-invite";
import { ReviewRequestBanner } from "@/components/student/review-request-banner";
import {
  ensureStudentReferralCode,
  buildReferralUrl,
  loadStudentReferralSummary,
} from "@/lib/referrals/data";
import { getReviewMomentsSettings } from "@/lib/notifications/settings";
import { getPublicOrigin } from "@/lib/utils/public-origin";
import { countStudentUnread } from "@/lib/chat/service";
import { PWAEmptyState, PWAPage } from "@/components/pwa/primitives";
import {
  createNlDateTimeFormatter,
  isSameZonedDay,
  resolveTenantTimeZone,
  zonedHour,
} from "@/lib/datetime";
import type { Lesson } from "@/lib/lessons/types";
import {
  VEHICLE_TRANSMISSION_LABEL,
  type VehicleTransmission,
} from "@/lib/lessons/types";
import type { StudentCreditBreakdown } from "@/lib/students/types";
import { getInstructorNames } from "@/lib/students/instructor-names";
import {
  buildStudentJourneySteps,
  roundedJourneyPct,
} from "@/lib/students/app-summary";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadStudentLeskaart } from "@/lib/skills/student-leskaart-data";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import { StudentHomeDashboard } from "@/components/student/HomeDashboard";
import {
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";
import {
  loadLatestStudentPlanningCard,
  loadStudentRisProgress,
} from "@/lib/ris/data";

export const dynamic = "force-dynamic";

function createStudentHomeFormatters(timeZone: string) {
  return {
    lessonTimeFmt: createNlDateTimeFormatter(
      {
        hour: "2-digit",
        minute: "2-digit",
      },
      timeZone,
    ),
    shortDateFmt: createNlDateTimeFormatter(
      {
        weekday: "short",
        day: "numeric",
        month: "short",
      },
      timeZone,
    ),
  };
}

function capitalize(text: string) {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

function greetingFor(date: Date, timeZone: string) {
  const hour = zonedHour(date, timeZone);
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

export default async function StudentHomePage() {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const timeZone = resolveTenantTimeZone(tenant);
  const { lessonTimeFmt, shortDateFmt } = createStudentHomeFormatters(timeZone);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <StudentShowcaseCard title={`Welkom bij ${tenant.name}`} eyebrow="Leerlingapp">
        <StudentShowcaseEmptyState
          title="Je account is nog niet gekoppeld"
          description="Neem contact op met je rijschool om je leerlingdossier te laten koppelen."
        />
      </StudentShowcaseCard>
    );
  }

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();

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

  const [
    breakdownRes,
    refillInvitations,
    slotRecoveryInvitations,
    nextLessonProposals,
    examInvitations,
    origin,
    referralCode,
    reviewSettings,
    referralSummary,
    chatUnread,
    readiness,
    leskaart,
    cbrSummary,
    completedLessonCountRes,
    milestoneAppointmentsRes,
    reviewNotif,
    latestPlanningCard,
    risProgress,
  ] = await Promise.all([
    supabase.from("student_credit_breakdown").select("*").eq("student_id", student.id).maybeSingle(),
    listOpenInvitationsForStudent(supabase, tenant.id, student.id),
    listOpenSlotRecoveryInvitationsForStudent(service, tenant.id, student.id),
    listOpenNextLessonProposalsForStudent(service, tenant.id, student.id),
    listOpenExamInvitationsForStudent(service, tenant.id, student.id),
    getPublicOrigin(),
    ensureStudentReferralCode(service, tenant.id, student.id, user.id),
    getReviewMomentsSettings(service, tenant.id),
    loadStudentReferralSummary(service, tenant.id, student.id),
    countStudentUnread({ tenantId: tenant.id, studentId: student.id }),
    loadStudentReadiness(supabase, tenant.id, student.id),
    loadStudentLeskaart(supabase, tenant.id, student.id),
    loadStudentCbrSummary(supabase, tenant.id, student.id),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .eq("status", "completed"),
    supabase
      .from("agenda_appointments")
      .select("type, status, starts_at, result")
      .eq("tenant_id", tenant.id)
      .eq("student_id", student.id)
      .in("type", ["interim_test", "exam"])
      .order("starts_at", { ascending: true }),
    supabase
      .from("app_notifications")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("type", "review_request")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadLatestStudentPlanningCard(supabase, tenant.id, student.id),
    loadStudentRisProgress(supabase, tenant.id, student.id),
  ]);

  const referralUrl = referralCode ? buildReferralUrl(origin, tenant.slug, referralCode) : null;
  const reviewNotificationId =
    ((reviewNotif.data as { id: string } | null)?.id as string | undefined) ?? null;
  const breakdown = breakdownRes.data as StudentCreditBreakdown | null;
  const completedLessonsCount =
    completedLessonCountRes.count ?? leskaart.history.filter((point) => point.status === "completed").length;
  const drivingTarget = Math.max(40, Math.ceil(Math.max(completedLessonsCount, 1) / 10) * 10);
  const journeyPct = roundedJourneyPct(leskaart.categories.map((category) => category.progressPct));
  const firstName = student.full_name.split(" ")[0] ?? "leerling";

  const milestoneAppointments = (milestoneAppointmentsRes.data ?? []) as Array<{
    type: string;
    status: string;
    starts_at: string;
    result: string | null;
  }>;
  const hasCompletedTtt = milestoneAppointments.some(
    (appointment) => appointment.type === "interim_test" && appointment.status === "completed",
  );
  const hasPlannedTtt = milestoneAppointments.some(
    (appointment) => appointment.type === "interim_test" && appointment.status === "planned",
  );
  const hasCompletedExam = milestoneAppointments.some(
    (appointment) => appointment.type === "exam" && appointment.status === "completed",
  );
  const hasPlannedExam = milestoneAppointments.some(
    (appointment) => appointment.type === "exam" && appointment.status === "planned",
  );
  const passedExam = milestoneAppointments.some(
    (appointment) =>
      appointment.type === "exam" &&
      appointment.status === "completed" &&
      appointment.result === "passed",
  );

  const journeySteps = buildStudentJourneySteps({
    theoryDone: cbrSummary.preconditions.theorieBehaald,
    completedLessonsCount,
    drivingTarget,
    hasCompletedTtt,
    hasPlannedTtt,
    hasCompletedExam,
    hasPlannedExam,
    passedExam,
  });

  const sparklineValues = leskaart.history
    .slice(-6)
    .map((point) =>
      Math.round(
        (Math.min(8, point.progressScore ?? point.averageScore) / 8) * 100,
      ),
    )
    .filter((value): value is number => Number.isFinite(value));

  const nextInstructorNames = nextLesson
    ? await getInstructorNames([nextLesson.instructor_id])
    : new Map<string, string>();

  const nextLessonVehicleRes = nextLesson?.vehicle_id
    ? await supabase
        .from("vehicles")
        .select("label, transmission")
        .eq("id", nextLesson.vehicle_id)
        .eq("tenant_id", tenant.id)
        .maybeSingle()
    : { data: null, error: null };

  if ("error" in nextLessonVehicleRes && nextLessonVehicleRes.error) {
    throw new Error(`Voertuig laden mislukt: ${nextLessonVehicleRes.error.message}`);
  }

  const vehicle = nextLessonVehicleRes.data as
    | {
        label: string;
        transmission: VehicleTransmission | null;
      }
    | null;

  const nextLessonVehicleLabel = vehicle
    ? [vehicle.label, vehicle.transmission ? VEHICLE_TRANSMISSION_LABEL[vehicle.transmission] : null]
        .filter(Boolean)
        .join(" - ")
    : null;

  const nextLessonSummary = nextLesson
    ? {
        href: `/student/agenda/${nextLesson.id}`,
        dayLabel: isSameZonedDay(new Date(nextLesson.starts_at), now, timeZone)
          ? "Vandaag"
          : capitalize(shortDateFmt.format(new Date(nextLesson.starts_at))),
        timeLabel: lessonTimeFmt.format(new Date(nextLesson.starts_at)),
        primary: nextInstructorNames.get(nextLesson.instructor_id) ?? tenant.name,
        secondary: nextLesson.location ?? "Locatie volgt",
        vehicle: nextLessonVehicleLabel,
      }
    : null;

  const examBadgeLabel =
    readiness.advice === "examenwaardig"
      ? "Examenklaar"
      : readiness.advice === "bijna_examenrijp"
        ? "Goed op weg"
        : "In opbouw";

  const examBadgeVariant =
    readiness.advice === "examenwaardig"
      ? "success"
      : readiness.advice === "bijna_examenrijp"
        ? "warning"
        : "default";

  const examEta =
    cbrSummary.derived.nextAppointmentAt && cbrSummary.derived.nextAppointmentType
      ? `${cbrSummary.derived.nextAppointmentType === "exam" ? "Examen" : "TTT"} ${capitalize(shortDateFmt.format(new Date(cbrSummary.derived.nextAppointmentAt)))}`
      : readiness.advice === "examenwaardig"
        ? "Bespreek de volgende examenstap met je instructeur"
        : "Nog geen betrouwbare datum of lesinschatting";

  const weakestCategory =
    [...leskaart.categories].sort(
      (left, right) =>
        right.criticalBelow - left.criticalBelow || left.progressPct - right.progressPct,
    )[0] ?? null;
  const historyPoints = leskaart.history.slice(-2);
  const recentDeltaPct =
    historyPoints.length === 2
      ? Math.round(((historyPoints[1]!.averageScore - historyPoints[0]!.averageScore) / 8) * 100)
      : null;

  const fallbackCoachTitle =
    recentDeltaPct && recentDeltaPct > 0
      ? "Sterke vooruitgang deze week! 🚀"
      : readiness.advice === "bijna_examenrijp"
        ? "Je zit dicht op examenniveau"
        : readiness.advice === "examenwaardig"
          ? "Je bent klaar voor de laatste stap"
          : "Je volgende slimme focus";

  const fallbackCoachBody =
    recentDeltaPct && recentDeltaPct > 0
      ? `Je gemiddelde lesniveau steeg ${recentDeltaPct}% in je laatste twee beoordeelde lessen.`
      : readiness.blockers[0]
        ? readiness.blockers[0]
        : weakestCategory
          ? `Focus de komende lessen extra op ${weakestCategory.label.toLowerCase()} om versneld door te groeien.`
          : `Je opbouw richting ${PHASE_LABELS[readiness.phase].toLowerCase()} ziet er stabiel uit.`;

  const planningGoal = latestPlanningCard?.goals[0] ?? null;
  const latestRisCard = risProgress.publishedCards[0] ?? null;
  const coachTitle =
    planningGoal?.title ??
    (latestRisCard ? "Je volgende RIS-focus" : fallbackCoachTitle);
  const coachBody =
    latestPlanningCard?.studentVisibleSummary ??
    planningGoal?.description ??
    latestRisCard?.homeworkOrNextFocus ??
    latestRisCard?.studentFriendlySummary ??
    fallbackCoachBody;
  const coachCtaHref =
    latestPlanningCard?.nextLessonId
      ? `/leerling/lessen/${latestPlanningCard.nextLessonId}`
      : latestRisCard
        ? `/leerling/lessen/${latestRisCard.lessonId}`
        : "/leerling/voortgang";

  const journeyStatus =
    passedExam
      ? "Je bent geslaagd!"
      : journeyPct >= 70
        ? "Je ligt op schema!"
        : journeyPct >= 40
          ? "Goede opbouw, ga zo door."
          : "Je rijbewijsreis is goed gestart.";

  return (
    <PWAPage app="student" contentClassName="space-y-4 sm:space-y-5">
      <StudentHomeDashboard
      greeting={greetingFor(now, timeZone)}
        firstName={firstName}
        journeyPct={journeyPct}
        journeyStatus={journeyStatus}
        journeySteps={journeySteps}
        sparklineValues={sparklineValues}
        nextLesson={nextLessonSummary}
        examStatus={{
          href: "/leerling/examens",
          readinessPct: readiness.readinessPct,
          badgeLabel: examBadgeLabel,
          badgeVariant: examBadgeVariant,
          title: "Voorwaarden richting examen",
          detail:
            readiness.blockers[0] ??
            `${ADVICE_LABELS[readiness.advice]} · ${PHASE_LABELS[readiness.phase]}`,
          eta: examEta,
        }}
        coach={{
          title: coachTitle,
          body: coachBody,
          ctaHref: coachCtaHref,
        }}
        messageUnreadCount={chatUnread}
        creditAvailableMinutes={breakdown?.available_minutes ?? 0}
      />

      {reviewNotificationId ? (
        <ReviewRequestBanner
          notificationId={reviewNotificationId}
          reviewUrl={reviewSettings.googleReviewUrl}
        />
      ) : null}

      <RefillInvitations invitations={refillInvitations} />
      <SlotRecoveryInvitations invitations={slotRecoveryInvitations} />
      <NextLessonProposals proposals={nextLessonProposals} />
      <ExamInvitations invitations={examInvitations} />

      {referralUrl ? (
        <ReferralInvite url={referralUrl} schoolName={tenant.name} summary={referralSummary} />
      ) : null}

      {!nextLesson && (breakdown?.available_minutes ?? 0) <= 0 ? (
        <section className="space-y-3">
          <PWAEmptyState message="Er staat nog geen vervolgles gepland en je tegoed is op. Vul je pakket aan of neem contact op met je rijschool om ritme te houden." />
        </section>
      ) : null}
    </PWAPage>
  );
}
