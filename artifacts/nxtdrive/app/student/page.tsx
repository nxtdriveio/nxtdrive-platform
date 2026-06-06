import { redirect } from "next/navigation";
import { CalendarDays, WalletCards } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
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
    : "Geen les gepland";
  const availableMinutes = breakdown?.available_minutes ?? 0;
  const creditLabel = formatTegoed(Math.max(0, availableMinutes));

  return (
    <div className="space-y-4 md:space-y-5">
      <section
        className="relative overflow-hidden rounded-[1.6rem] border border-white/10 px-4 py-5 text-white shadow-xl shadow-primary/15 sm:px-6 sm:py-6"
        style={{
          background:
            "radial-gradient(circle at 15% 0%, rgba(255,255,255,0.28), transparent 25%), radial-gradient(circle at 95% 5%, rgba(255,255,255,0.16), transparent 26%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 88%, #111827), color-mix(in oklab, var(--primary) 45%, #020617) 62%, #020617)",
        }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

        <div className="relative space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              {tenant.name}
            </p>
            <h1 className="mt-2 text-balance text-2xl font-black leading-[1.04] tracking-tight sm:text-4xl">
              Hoi {firstName}, klaar voor je volgende stap?
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur">
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/65">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Volgende les
              </div>
              <div className="mt-1.5 truncate text-sm font-bold capitalize text-white">
                {nextLessonLabel}
              </div>
              {nextLesson?.location ? (
                <div className="mt-0.5 truncate text-[11px] text-white/55">
                  {nextLesson.location}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur">
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/65">
                <WalletCards className="h-3.5 w-3.5" aria-hidden />
                Tegoed
              </div>
              <div className="mt-1.5 truncate text-sm font-bold text-white">
                {creditLabel}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-white/55">
                {availableMinutes <= 0 ? "Aanvullen nodig" : "Beschikbaar"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <QuickActions />

      {reviewNotificationId ? (
        <ReviewRequestBanner
          notificationId={reviewNotificationId}
          reviewUrl={reviewSettings.googleReviewUrl}
        />
      ) : null}

      <RefillInvitations invitations={refillInvitations} />

      <ExamInvitations invitations={examInvitations} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ContactCard
          schoolName={tenant.name}
          contactPhone={contactPhone}
          unreadCount={chatUnread}
        />

        <StudentTheoryHomeworkCard homework={homework} emptyHint={false} />
      </div>

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
