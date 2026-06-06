import { redirect } from "next/navigation";
import { CalendarDays, Sparkles, WalletCards } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { NextLessonCard } from "@/components/student/NextLessonCard";
import { CreditSummaryCard } from "@/components/student/CreditSummaryCard";
import { QuickActions } from "@/components/student/QuickActions";
import { ContactCard } from "@/components/student/ContactCard";
import { loadContactPhone } from "@/lib/tenant/contact-phone";
import { countStudentUnread } from "@/lib/chat/service";
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
import {
  formatTegoed,
  type StudentCreditBreakdown,
} from "@/lib/students/types";

export const dynamic = "force-dynamic";

const heroLessonFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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
  const [
    origin,
    referralCode,
    reviewSettings,
    referralSummary,
    contactPhone,
    chatUnread,
  ] = await Promise.all([
    getPublicOrigin(),
    ensureStudentReferralCode(service, tenant.id, student.id, user.id),
    getReviewMomentsSettings(service, tenant.id),
    loadStudentReferralSummary(service, tenant.id, student.id),
    loadContactPhone(service, tenant.id),
    countStudentUnread({ tenantId: tenant.id, studentId: student.id }),
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
  const nextLessonLabel = nextLesson?.starts_at
    ? heroLessonFmt.format(new Date(nextLesson.starts_at))
    : "Nog geen les";
  const availableMinutes = breakdown?.available_minutes ?? 0;
  const creditLabel = formatTegoed(Math.max(0, availableMinutes));

  return (
    <div className="space-y-5 md:space-y-6">
      <section
        className="relative overflow-hidden rounded-[2rem] border border-white/10 px-5 py-6 text-white shadow-2xl shadow-primary/20 sm:px-7 sm:py-8"
        style={{
          background:
            "radial-gradient(circle at 16% 10%, rgba(255,255,255,0.32), transparent 26%), radial-gradient(circle at 86% 0%, rgba(255,255,255,0.18), transparent 26%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 94%, #111827), color-mix(in oklab, var(--primary) 55%, #020617) 58%, #020617)",
        }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -bottom-20 left-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Leerling app
          </div>

          <div className="max-w-xl">
            <h1 className="text-balance text-3xl font-black leading-[1.02] tracking-tight sm:text-5xl">
              Rij slim vandaag, {firstName}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/78 sm:text-base">
              Je planning, voortgang en acties staan klaar. Alles wat je nodig
              hebt voor je volgende stap, zonder zoeken.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-medium text-white/65">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Volgende les
              </div>
              <div className="mt-2 text-sm font-bold capitalize text-white">
                {nextLessonLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-medium text-white/65">
                <WalletCards className="h-4 w-4" aria-hidden />
                Tegoed
              </div>
              <div className="mt-2 text-sm font-bold text-white">{creditLabel}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur min-[390px]:col-span-2 sm:col-span-1">
              <div className="text-xs font-medium text-white/65">Vandaag</div>
              <div className="mt-2 text-sm font-bold text-white">
                Klaar voor vertrek
              </div>
            </div>
          </div>
        </div>
      </section>

      {reviewNotificationId ? (
        <ReviewRequestBanner
          notificationId={reviewNotificationId}
          reviewUrl={reviewSettings.googleReviewUrl}
        />
      ) : null}

      <RefillInvitations invitations={refillInvitations} />

      <ExamInvitations invitations={examInvitations} />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
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
          availableMinutes={availableMinutes}
          purchasedMinutes={breakdown?.purchased_minutes ?? 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <QuickActions />

        <ContactCard
          schoolName={tenant.name}
          contactPhone={contactPhone}
          unreadCount={chatUnread}
        />
      </div>

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
