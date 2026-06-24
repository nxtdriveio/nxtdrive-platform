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
import { StudentPostLessonResponseForm } from "@/components/ris/StudentPostLessonResponseForm";
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
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import {
  loadStudentRisLessonCardDetail,
  RIS_REFLECTION_RATING_LABELS,
} from "@/lib/ris/data";
import { loadLessonSelfServicePreview } from "@/lib/lessons/student-self-service";
import {
  VEHICLE_TRANSMISSION_LABEL,
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

  const [names, skillGroups, leskaart, homework, risDetail] = await Promise.all([
    getInstructorNames([lesson.instructor_id]),
    loadStudentLessonSkills(supabase, tenant.id, student.id, lesson.id),
    loadStudentLeskaart(supabase, tenant.id, student.id),
    loadLessonTheoryHomework(supabase, tenant.id, lesson.id),
    loadStudentRisLessonCardDetail(supabase, tenant.id, student.id, lesson.id),
  ]);
  const instructorName = names.get(lesson.instructor_id);
  const hasRisLessonCard = Boolean(risDetail.card);
  const reflectionRatingRows = risDetail.card?.reflection
    ? ([
        ["Algemeen", risDetail.card.reflection.overallRating],
        ["Zelfstandigheid", risDetail.card.reflection.independenceRating],
        ["Inzicht", risDetail.card.reflection.insightRating],
        ["Vertrouwen", risDetail.card.reflection.confidenceRating],
      ] as const)
    : [];

  const selfService = await loadLessonSelfServicePreview(
    supabase,
    tenant.id,
    lesson,
  );

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

      {risDetail.planningCard ? (
        <StudentShowcaseCard title="Jouw plankaart" eyebrow="Voor deze les">
          <div className="space-y-3">
            {risDetail.planningCard.studentVisibleSummary ? (
              <p className="text-sm leading-6 text-brand-muted-foreground">
                {risDetail.planningCard.studentVisibleSummary}
              </p>
            ) : null}
            {risDetail.planningCard.goals.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {risDetail.planningCard.goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-2xl border border-brand-border bg-white/75 p-3"
                  >
                    <p className="text-sm font-black text-brand-foreground">{goal.title}</p>
                    {goal.description ? (
                      <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
                        {goal.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </StudentShowcaseCard>
      ) : null}

      {risDetail.card ? (
        <StudentShowcaseCard title="RIS-leskaart" eyebrow="Gepubliceerde les">
          <div className="space-y-4">
            {risDetail.card.studentFriendlySummary ? (
              <p className="text-sm leading-6 text-brand-foreground">
                {risDetail.card.studentFriendlySummary}
              </p>
            ) : null}

            {risDetail.card.reflection ? (
              <div className="rounded-2xl border border-brand-border bg-white/75 p-3">
                <p className="text-xs font-semibold uppercase text-brand-muted-foreground">
                  Samen gereflecteerd
                </p>
                {risDetail.card.reflection.oneSentenceReflection ? (
                  <p className="mt-2 text-sm font-semibold leading-6 text-brand-foreground">
                    {risDetail.card.reflection.oneSentenceReflection}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {reflectionRatingRows.map(([label, rating]) =>
                    rating ? (
                      <span
                        key={label}
                        className="rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-brand-primary"
                      >
                        {label}: {RIS_REFLECTION_RATING_LABELS[rating]}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}

            {risDetail.assessments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-brand-muted-foreground">
                  Beoordeelde onderdelen
                </p>
                {risDetail.assessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    className="flex flex-col gap-2 rounded-2xl border border-brand-border bg-white/75 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-black text-brand-foreground">
                        Module {assessment.moduleNumber} · {assessment.scriptTitle}
                      </p>
                      <p className="mt-1 text-sm text-brand-muted-foreground">
                        {assessment.studentVisibleNote || assessment.studentLabel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-primary px-3 py-1 text-xs font-black text-white">
                      {assessment.finalRisStep ? `Score ${assessment.finalRisStep}/8` : "Nog niet beoordeeld"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {risDetail.card.homeworkOrNextFocus ? (
              <div className="rounded-2xl border border-brand-primary/20 bg-brand-accent p-3">
                <p className="text-xs font-semibold uppercase text-brand-primary">
                  Volgende focus
                </p>
                <p className="mt-2 text-sm leading-6 text-brand-foreground">
                  {risDetail.card.homeworkOrNextFocus}
                </p>
              </div>
            ) : null}

            {risDetail.card.response ? (
              <div className="rounded-2xl border border-success/30 bg-success/10 p-3">
                <p className="text-sm font-black text-success">
                  Reactie ontvangen
                </p>
                {risDetail.card.response.skippedResponse ? (
                  <p className="mt-1 text-sm text-brand-muted-foreground">
                    Je hebt deze reactie overgeslagen.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1 text-sm leading-6 text-brand-muted-foreground">
                    {risDetail.card.response.commentText ? (
                      <p>{risDetail.card.response.commentText}</p>
                    ) : null}
                    {risDetail.card.response.nextLessonWish ? (
                      <p>Volgende les: {risDetail.card.response.nextLessonWish}</p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <StudentPostLessonResponseForm
                lessonCardId={risDetail.card.id}
                lessonId={lesson.id}
              />
            )}
          </div>
        </StudentShowcaseCard>
      ) : null}

      {!hasRisLessonCard ? (
        <>
          <LessonPracticedChips skills={practiced} />

          <StudentCategoryProgressCard categories={leskaart.categories} />

          <LessonSkillFeedbackCard groups={skillGroups} />

          <LessonNotesCard
            studentNote={lesson.student_note}
            attentionPoints={lesson.attention_points}
          />

          <LessonAdviceCard advice={lesson.advice} />
        </>
      ) : null}

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

      {selfService.isFuturePlanned ? (
        <>
          <RescheduleLessonButton
            lessonId={lesson.id}
            currentStartsAt={lesson.starts_at}
            canReschedule={selfService.canReschedule}
            minNoticeHours={selfService.minNoticeHours}
            blockedReason={selfService.rescheduleBlockedReason}
          />
          <CancelLessonButton
            lessonId={lesson.id}
            lessonCredits={lesson.credits_cost}
            refundCredits={selfService.refundCredits}
            refundPct={selfService.refundPct}
            canCancel={selfService.canCancel}
            minNoticeHours={selfService.minNoticeHours}
            blockedReason={selfService.cancelBlockedReason}
          />
        </>
      ) : lesson.status === "planned" ? (
        <StudentShowcaseNotice
          tone="warning"
          title="Deze les kan niet meer zelf gewijzigd worden"
          description="De starttijd is bereikt of verstreken. Neem contact op met je rijschool als er nog iets moet worden aangepast."
        />
      ) : null}

      <LessonNavFooter
        prevLessonId={prevLessonId}
        nextLessonId={nextLessonId}
        contactHref="/student/profile"
      />
    </PWAPage>
  );
}
