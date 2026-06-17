import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LessonHeaderCard } from "@/components/student/LessonHeaderCard";
import { LessonPracticedChips } from "@/components/student/LessonPracticedChips";
import { LessonNotesCard } from "@/components/student/LessonNotesCard";
import { LessonAdviceCard } from "@/components/student/LessonAdviceCard";
import { LessonNavFooter } from "@/components/student/LessonNavFooter";
import { LessonSkillFeedbackCard } from "@/components/skills/LessonSkillFeedbackCard";
import { StudentCategoryProgressCard } from "@/components/skills/StudentCategoryProgressCard";
import { StudentTheoryHomeworkCard } from "@/components/student/TheoryHomeworkCard";
import { StudentLessonContextCard } from "@/components/student/LessonContextCard";
import { getActiveStudent } from "@/lib/students/access";
import { getInstructorNames } from "@/lib/students/instructor-names";
import {
  loadStudentLessonSkills,
  loadStudentLeskaart,
} from "@/lib/skills/student-leskaart-data";
import { loadLessonTheoryHomework } from "@/lib/theory/data";
import { CancelLessonButton } from "@/components/student/CancelLessonButton";
import { RescheduleLessonButton } from "@/components/student/RescheduleLessonButton";
import {
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { loadCancellationPolicy } from "@/lib/lessons/cancellation-policy";
import {
  VEHICLE_TRANSMISSION_LABEL,
  refundPctForHours,
  type Lesson,
} from "@/lib/lessons/types";

export const dynamic = "force-dynamic";

export default async function StudentLessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
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
  if (!student) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: lessonRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (!lessonRaw) notFound();
  const lesson = lessonRaw as Lesson;

  const [names, skillGroups, leskaart, homework] = await Promise.all([
    getInstructorNames([lesson.instructor_id]),
    loadStudentLessonSkills(supabase, tenant.id, student.id, lesson.id),
    loadStudentLeskaart(supabase, tenant.id, student.id),
    loadLessonTheoryHomework(supabase, tenant.id, lesson.id),
  ]);
  const instructorName = names.get(lesson.instructor_id);

  // Student self-cancellation: only for a planned, future lesson. Refund preview
  // mirrors the tenant policy tier the student_cancel_lesson RPC will apply, and
  // canCancel reflects the configurable min-notice window (0 = no minimum).
  const hoursBefore = Math.max(
    0,
    (new Date(lesson.starts_at).getTime() - Date.now()) / 3_600_000,
  );
  const isCancellable = lesson.status === "planned" && hoursBefore > 0;
  const policy = isCancellable
    ? await loadCancellationPolicy(supabase, tenant.id)
    : null;
  const refundPct = policy ? refundPctForHours(policy, hoursBefore) : 0;
  const refundCredits = Math.max(
    0,
    Math.min(lesson.credits_cost, Math.round((lesson.credits_cost * refundPct) / 100)),
  );
  const canCancel = isCancellable
    ? hoursBefore >= (policy?.min_notice_hours ?? 0)
    : false;

  // Prev/next lesson in this student's chronological lesson list.
  const [prevRes, nextRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("id")
      .eq("student_id", student.id)
      .lt("starts_at", lesson.starts_at)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id")
      .eq("student_id", student.id)
      .gt("starts_at", lesson.starts_at)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const prevLessonId = (prevRes.data as { id: string } | null)?.id ?? null;
  const nextLessonId = (nextRes.data as { id: string } | null)?.id ?? null;

  // Resolve lescontext labels (voertuig, locatie, behandelde onderdelen).
  const [vehicleRes, locationRes, topicsRes] = await Promise.all([
    lesson.vehicle_id
      ? supabase
          .from("vehicles")
          .select("label, license_plate, transmission")
          .eq("id", lesson.vehicle_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    lesson.location_id
      ? supabase
          .from("locations")
          .select("name")
          .eq("id", lesson.location_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("lesson_topics")
      .select("skill_taxonomy(label)")
      .eq("lesson_id", lesson.id)
      .eq("tenant_id", tenant.id),
  ]);

  if ("error" in vehicleRes && vehicleRes.error) {
    throw new Error(`Voertuig laden mislukt: ${vehicleRes.error.message}`);
  }
  if ("error" in locationRes && locationRes.error) {
    throw new Error(`Locatie laden mislukt: ${locationRes.error.message}`);
  }
  if (topicsRes.error) {
    throw new Error(
      `Behandelde onderdelen laden mislukt: ${topicsRes.error.message}`,
    );
  }

  const veh = vehicleRes.data as
    | { label: string; license_plate: string | null; transmission: keyof typeof VEHICLE_TRANSMISSION_LABEL | null }
    | null;
  const vehicleLabel = veh
    ? [
        veh.label,
        veh.license_plate ? `(${veh.license_plate})` : null,
        veh.transmission ? `- ${VEHICLE_TRANSMISSION_LABEL[veh.transmission]}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  const locationName =
    (locationRes.data as { name: string } | null)?.name ?? null;
  const topics = ((topicsRes.data ?? []) as {
    skill_taxonomy: { label: string } | { label: string }[] | null;
  }[])
    .map((r) =>
      Array.isArray(r.skill_taxonomy)
        ? r.skill_taxonomy[0]?.label
        : r.skill_taxonomy?.label,
    )
    .filter((l): l is string => Boolean(l));

  // "Vandaag geoefend" chips: every skill graded during this lesson.
  const practiced = skillGroups.flatMap((g) =>
    g.skills.map((s) => ({
      id: s.id,
      label: s.label,
      isCritical: s.isCritical,
    })),
  );

  return (
    <PWAPage contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Lesoverzicht"
        title="Lesdetails"
        description="Alles van deze les staat hier compact bij elkaar: feedback, geoefende onderdelen, context en vervolg."
        align="left"
        actions={
          <Link
            href="/student/lessons"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar lessen
          </Link>
        }
      />

      <LessonHeaderCard lesson={lesson} instructorName={instructorName} />

      <LessonPracticedChips skills={practiced} />

      <StudentCategoryProgressCard categories={leskaart.categories} />

      <LessonSkillFeedbackCard groups={skillGroups} />

      <LessonNotesCard
        studentNote={lesson.student_note}
        attentionPoints={lesson.attention_points}
      />

      <LessonAdviceCard advice={lesson.advice} />

      <StudentLessonContextCard
        vehicleLabel={vehicleLabel}
        locationName={locationName}
        topics={topics}
      />

      {homework.length > 0 ? (
        <StudentTheoryHomeworkCard homework={homework} emptyHint={false} />
      ) : null}

      {lesson.progress_summary ? (
        <StudentShowcaseCard
          title="Toelichting van je instructeur"
          eyebrow="Lesreflectie"
        >
          <p className="whitespace-pre-wrap text-sm leading-6 text-white/70">
            {lesson.progress_summary}
          </p>
        </StudentShowcaseCard>
      ) : lesson.status === "completed" ? (
        <StudentShowcaseCard title="Toelichting van je instructeur" eyebrow="Lesreflectie">
          <StudentShowcaseEmptyState
            title="Nog geen toelichting gedeeld"
            description="Je instructeur heeft voor deze les nog geen extra samenvatting toegevoegd."
          />
        </StudentShowcaseCard>
      ) : null}

      {isCancellable ? (
        <>
          <RescheduleLessonButton
            lessonId={lesson.id}
            currentStartsAt={lesson.starts_at}
            canReschedule={canCancel}
            minNoticeHours={policy?.min_notice_hours ?? 0}
          />
          <CancelLessonButton
            lessonId={lesson.id}
            lessonCredits={lesson.credits_cost}
            refundCredits={refundCredits}
            refundPct={refundPct}
            canCancel={canCancel}
            minNoticeHours={policy?.min_notice_hours ?? 0}
          />
        </>
      ) : null}

      <LessonNavFooter
        prevLessonId={prevLessonId}
        nextLessonId={nextLessonId}
        contactHref="/student/profile"
      />
    </PWAPage>
  );
}
