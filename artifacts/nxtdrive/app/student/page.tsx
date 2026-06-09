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
import {
  PWAEmptyState,
  PWAHero,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWASectionHeader,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const heroLessonFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function StudentHomePage() {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h1 className="text-xl font-semibold text-foreground">Welkom bij {tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Je account is nog niet gekoppeld aan een leerlingdossier. Neem contact op met je
            rijschool om dit in orde te maken.
          </p>
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

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
    supabase.from("student_credit_breakdown").select("*").eq("student_id", student.id).maybeSingle(),
    loadStudentTheoryHomework(supabase, tenant.id, student.id),
    listOpenInvitationsForStudent(supabase, tenant.id, student.id),
  ]);
  const breakdown = breakdownRes.data as StudentCreditBreakdown | null;

  const examInvitations = await listOpenExamInvitationsForStudent(
    createServiceRoleClient(),
    tenant.id,
    student.id,
  );

  const service = createServiceRoleClient();
  const [origin, referralCode, reviewSettings, referralSummary, contactPhone, chatUnread] =
    await Promise.all([
      getPublicOrigin(),
      ensureStudentReferralCode(service, tenant.id, student.id, user.id),
      getReviewMomentsSettings(service, tenant.id),
      loadStudentReferralSummary(service, tenant.id, student.id),
      loadContactPhone(service, tenant.id),
      countStudentUnread({ tenantId: tenant.id, studentId: student.id }),
    ]);
  const referralUrl = referralCode ? buildReferralUrl(origin, tenant.slug, referralCode) : null;

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
    : "Nog geen les gepland";
  const availableMinutes = breakdown?.available_minutes ?? 0;
  const creditLabel = formatTegoed(Math.max(0, availableMinutes));

  return (
    <PWAPage app="student">
      <PWAHero
        app="student"
        eyebrow={tenant.name}
        title={`Welkom terug, ${firstName}`}
        subtitle="Alles wat je nu moet regelen staat direct voor je klaar: je planning, voortgang, tegoed en contact met je rijschool."
        aside={
          <PWAKpiGrid compact className="w-full min-w-0 max-w-sm">
            <PWAKpiTile
              label={
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  Volgende les
                </span>
              }
              value={nextLessonLabel}
              hint={nextLesson?.location ?? "Plan je volgende les met je rijschool"}
              className="border-white/10 bg-white/10 text-white [&_p:first-child]:text-white/70 [&_p:last-child]:text-white/60"
            />
            <PWAKpiTile
              label={
                <span className="inline-flex items-center gap-1.5">
                  <WalletCards className="h-3.5 w-3.5" aria-hidden />
                  Tegoed
                </span>
              }
              value={creditLabel}
              hint={availableMinutes <= 0 ? "Aanvullen nodig" : "Direct inzetbaar"}
              className="border-white/10 bg-white/10 text-white [&_p:first-child]:text-white/70 [&_p:last-child]:text-white/60"
            />
          </PWAKpiGrid>
        }
      />

      <QuickActions />

      {reviewNotificationId ? (
        <ReviewRequestBanner
          notificationId={reviewNotificationId}
          reviewUrl={reviewSettings.googleReviewUrl}
        />
      ) : null}

      <RefillInvitations invitations={refillInvitations} />
      <ExamInvitations invitations={examInvitations} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ContactCard
          schoolName={tenant.name}
          contactPhone={contactPhone}
          unreadCount={chatUnread}
        />
        <StudentTheoryHomeworkCard homework={homework} emptyHint={false} />
      </div>

      {referralUrl ? (
        <ReferralInvite url={referralUrl} schoolName={tenant.name} summary={referralSummary} />
      ) : null}

      {!nextLesson && availableMinutes <= 0 ? (
        <section className="space-y-3">
          <PWASectionHeader>Directe aandacht</PWASectionHeader>
          <PWAEmptyState message="Er staat nog geen vervolgles gepland en je tegoed is op. Vul je pakket aan of neem contact op met je rijschool om ritme te houden." />
        </section>
      ) : null}
    </PWAPage>
  );
}
