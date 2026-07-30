import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Car, Clock, UserRound } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { CBR_EXAM_STATUS_LABEL } from "@/lib/cbr/derive";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import { MACHTIGING_STATUS_LABEL } from "@/lib/cbr/types";
import { loadEndOfLessonSchedulingState } from "@/lib/end-of-lesson-scheduling/service";
import { LESSON_STATUS_LABEL, type LessonStatus } from "@/lib/lessons/types";
import type { PlanningActorAccess } from "@/lib/planning-core";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadInstructorRisLessonCard,
  loadStudentPlanningCardForLesson,
  loadStudentRisProgress,
} from "@/lib/ris/data";
import { buildNextFocusProposal } from "@/lib/ris/next-focus";
import {
  RisEvaluationTabs,
  type EvaluationLessonInfo,
} from "@/components/ris/RisEvaluationTabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { risStepNumber } from "@workspace/leskaart";

const LESSON_SELECT =
  "id, branch_id, student_id, instructor_id, vehicle_id, status, starts_at, ends_at, duration_min, location, notes, progress_score, progress_summary, location_id, pickup_service_area_id, student_note, attention_points, advice";

const OPEN_LESSON_STATUSES = ["planned", "in_progress"] as const;

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

type LessonRow = {
  id: string;
  branch_id: string | null;
  student_id: string;
  instructor_id: string | null;
  vehicle_id: string | null;
  status: LessonStatus;
  starts_at: string;
  ends_at: string | null;
  duration_min: number | null;
  location: string | null;
  notes: string | null;
  progress_score: number | null;
  progress_summary: string | null;
  location_id: string | null;
  pickup_service_area_id: string | null;
  student_note: string | null;
  attention_points: string | null;
  advice: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export async function RisEvaluationWorkspace({ lessonId }: { lessonId: string }) {
  const { tenant, user, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const service = createServiceRoleClient();
  const isAdmin = roles.includes("tenant_admin");

  const { data: clickedLessonRaw, error: clickedLessonError } = await service
    .from("lessons")
    .select(LESSON_SELECT)
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (clickedLessonError) {
    throw new Error(`Les laden mislukt: ${clickedLessonError.message}`);
  }
  const clickedLesson = clickedLessonRaw as LessonRow | null;
  if (!clickedLesson) notFound();
  if (!isAdmin && clickedLesson.instructor_id !== user.id) {
    notFound();
  }

  const openLesson = await loadNextOpenLesson({
    tenantId: tenant.id,
    studentId: clickedLesson.student_id,
    instructorId: user.id,
    isAdmin,
    fallback: clickedLesson,
  });
  const lesson = OPEN_LESSON_STATUSES.includes(
    clickedLesson.status as (typeof OPEN_LESSON_STATUSES)[number],
  )
    ? clickedLesson
    : openLesson ?? clickedLesson;

  const [
    studentRes,
    vehicleRes,
    serviceAreaRes,
    ris,
    planningCard,
    studentRisProgress,
    cbrSummary,
    latestResponseRes,
    endOfLessonScheduling,
  ] = await Promise.all([
    service
      .from("students")
      .select("id, full_name, email, phone, notes")
      .eq("id", lesson.student_id)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    lesson.vehicle_id
      ? service
          .from("vehicles")
          .select("label, license_plate")
          .eq("id", lesson.vehicle_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lesson.pickup_service_area_id
      ? service
          .from("service_areas")
          .select("name")
          .eq("id", lesson.pickup_service_area_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadInstructorRisLessonCard(service, tenant.id, lesson.id),
    loadStudentPlanningCardForLesson(
      service,
      tenant.id,
      lesson.student_id,
      lesson.id,
      { includeDraft: true },
    ),
    loadStudentRisProgress(service, tenant.id, lesson.student_id),
    loadStudentCbrSummary(service, tenant.id, lesson.student_id),
    service
      .from("student_post_lesson_responses")
      .select("next_lesson_wish, comment_text, submitted_at")
      .eq("tenant_id", tenant.id)
      .eq("student_id", lesson.student_id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadEndOfLessonSchedulingState(service, {
      tenant,
      lessonId: lesson.id,
      actor: planningActor({
        userId: user.id,
        tenantId: tenant.id,
        roles,
        isPlatformAdmin: Boolean(user.profile?.is_platform_admin),
      }),
    }),
  ]);
  if (studentRes.error) throw new Error(`Leerling laden mislukt: ${studentRes.error.message}`);
  if (vehicleRes.error) throw new Error(`Voertuig laden mislukt: ${vehicleRes.error.message}`);
  if (serviceAreaRes.error) {
    throw new Error(`Rayon laden mislukt: ${serviceAreaRes.error.message}`);
  }
  if (latestResponseRes.error) {
    throw new Error(`Leerwens laden mislukt: ${latestResponseRes.error.message}`);
  }

  const student = studentRes.data as StudentRow | null;
  if (!student) notFound();
  const vehicle = vehicleRes.data as { label: string; license_plate: string | null } | null;
  const serviceArea = serviceAreaRes.data as { name: string } | null;
  const vehicleLabel = vehicle
    ? [vehicle.label, vehicle.license_plate ? `(${vehicle.license_plate})` : null]
        .filter(Boolean)
        .join(" ")
    : "Geen voertuig gekoppeld";
  const goalOptions = Array.from(
    new Set(
      ris.catalog.tree.flatMap((module) =>
        module.categories.flatMap((category) =>
          category.scripts.map((script) => `${script.code} - ${script.title}`),
        ),
      ),
    ),
  );

  const lessonInfo = buildLessonInfo({
    student,
    lesson,
    vehicleLabel,
    pickupAreaName: serviceArea?.name ?? null,
    studentRisProgress,
    cbrSummary,
    ris,
  });
  const latestResponse = latestResponseRes.data as {
    next_lesson_wish: string | null;
    comment_text: string | null;
    submitted_at: string;
  } | null;
  const studentLearningWish = latestResponse?.next_lesson_wish?.trim() || null;
  const assessmentByScript = new Map(
    ris.assessments.map((assessment) => [assessment.scriptId, assessment]),
  );
  const progressByScript = new Map(
    studentRisProgress.progress.map((item) => [item.scriptId, item]),
  );
  const nextFocusProposal = buildNextFocusProposal({
    learnerWish: studentLearningWish,
    candidates: ris.catalog.tree.flatMap((module) =>
      module.categories.flatMap((category) =>
        category.scripts.map((script) => {
          const assessment = assessmentByScript.get(script.id);
          const progress = progressByScript.get(script.id);
          return {
            scriptId: script.id,
            code: script.code,
            title: script.title,
            moduleNumber: module.moduleNumber,
            instructionStage: risStepNumber(
              assessment?.conceptRisStep ??
                assessment?.finalRisStep ??
                progress?.currentFinalStep,
            ),
            performanceOutcome: assessment?.performanceOutcome,
            safetyStatus: assessment?.safetyStatus,
            isAttentionPoint:
              assessment?.isAttentionPoint ?? progress?.isAttentionPoint ?? false,
            shouldRepeat: assessment?.shouldRepeat ?? false,
            wasFocus: assessment?.isFeaturedForLesson ?? false,
          };
        }),
      ),
    ),
  });

  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-4 px-3 pb-8 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 rounded-[1.6rem] border border-border bg-card/85 p-4 shadow-brand-card lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/instructeur/agenda"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar agenda
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Lesson Cockpit</Badge>
            <Badge variant={lesson.status === "completed" ? "success" : "outline"}>
              {LESSON_STATUS_LABEL[lesson.status] ?? lesson.status}
            </Badge>
            {lesson.id !== lessonId ? (
              <Badge variant="info">Eerstvolgende open leskaart</Badge>
            ) : null}
          </div>
          <h1 className="mt-3 text-[1.65rem] font-black leading-tight text-foreground sm:text-2xl xl:text-[2.35rem]">
            Lesson Cockpit
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {student.full_name} - {dateFmt.format(new Date(lesson.starts_at))} -
            {" "}
            {timeRange(lesson.starts_at, lesson.ends_at)}
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[28rem]">
          <InfoLine icon={UserRound} label={student.full_name} />
          <InfoLine icon={CalendarDays} label={dateTimeFmt.format(new Date(lesson.starts_at))} />
          <InfoLine icon={Clock} label={durationLabel(lesson)} />
          <InfoLine icon={Car} label={vehicleLabel} />
        </div>
      </div>

      {ris.settings.lessonCardMode !== "ris" ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-5 text-sm leading-6 text-warning">
            RIS staat nog niet actief voor deze tenant. Activeer RIS in de
            backoffice om nieuwe leskaarten volgens de RIS-methode te gebruiken.
          </CardContent>
        </Card>
      ) : null}

      <RisEvaluationTabs
        lessonId={lesson.id}
        studentId={student.id}
        studentName={student.full_name}
        ris={ris}
        planningCard={planningCard}
        goalOptions={goalOptions}
        recommendedGoals={nextFocusProposal.recommendations}
        recommendationExplanation={nextFocusProposal.explanation}
        lessonInfo={lessonInfo}
        studentLearningWish={studentLearningWish}
        endOfLessonScheduling={endOfLessonScheduling}
      />
    </div>
  );

  async function loadNextOpenLesson({
    tenantId,
    studentId,
    instructorId,
    isAdmin,
    fallback,
  }: {
    tenantId: string;
    studentId: string;
    instructorId: string;
    isAdmin: boolean;
    fallback: LessonRow;
  }): Promise<LessonRow | null> {
    let query = service
      .from("lessons")
      .select(LESSON_SELECT)
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .in("status", Array.from(OPEN_LESSON_STATUSES))
      .gte("starts_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());

    if (!isAdmin) {
      query = query.eq("instructor_id", instructorId);
    }

    const { data, error } = await query
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Open leskaart zoeken mislukt: ${error.message}`);
    return (
      (data as LessonRow | null) ??
      (OPEN_LESSON_STATUSES.includes(
        fallback.status as (typeof OPEN_LESSON_STATUSES)[number],
      )
        ? fallback
        : null)
    );
  }
}

function planningActor(ctx: {
  userId: string;
  tenantId: string;
  roles: readonly string[];
  isPlatformAdmin: boolean;
}): PlanningActorAccess {
  const canManageTenant =
    ctx.isPlatformAdmin || ctx.roles.includes("tenant_admin");
  return {
    userId: ctx.userId,
    roles: ctx.roles as PlanningActorAccess["roles"],
    isPlatformAdmin: ctx.isPlatformAdmin,
    tenantIds: canManageTenant ? [ctx.tenantId] : [],
    branchAccess: [{ tenantId: ctx.tenantId, branchIds: "all" }],
  };
}

function buildLessonInfo({
  student,
  lesson,
  vehicleLabel,
  pickupAreaName,
  studentRisProgress,
  cbrSummary,
  ris,
}: {
  student: StudentRow;
  lesson: LessonRow;
  vehicleLabel: string;
  pickupAreaName: string | null;
  studentRisProgress: Awaited<ReturnType<typeof loadStudentRisProgress>>;
  cbrSummary: Awaited<ReturnType<typeof loadStudentCbrSummary>>;
  ris: Awaited<ReturnType<typeof loadInstructorRisLessonCard>>;
}): EvaluationLessonInfo {
  const scriptMap = new Map<string, string>();
  for (const module of ris.catalog.tree) {
    for (const category of module.categories) {
      for (const script of category.scripts) {
        scriptMap.set(script.id, `${script.code}: ${script.title}`);
      }
    }
  }
  const radarItems = studentRisProgress.progress
    .filter((item) => item.isAttentionPoint || item.readyForModuleTest)
    .slice(0, 6)
    .map((item) => scriptMap.get(item.scriptId) ?? "RIS-script met aandacht");

  return {
    studentName: student.full_name,
    studentEmail: student.email,
    studentPhone: student.phone,
    statusLabel: LESSON_STATUS_LABEL[lesson.status] ?? lesson.status,
    dateLabel: dateFmt.format(new Date(lesson.starts_at)),
    timeLabel: timeRange(lesson.starts_at, lesson.ends_at),
    durationLabel: durationLabel(lesson),
    location: lesson.location ?? "Ophaallocatie volgt",
    pickupAreaName,
    vehicleLabel,
    progressPct: studentRisProgress.progressPct,
    progressSummary: lesson.progress_summary,
    cbrItems: [
      {
        label: "Theorie",
        ok: cbrSummary.preconditions.theorieBehaald,
        value: cbrSummary.preconditions.theorieBehaald ? "Behaald" : "Nog niet behaald",
      },
      {
        label: "Machtiging",
        ok: cbrSummary.preconditions.machtigingGeregeld,
        value: MACHTIGING_STATUS_LABEL[cbrSummary.preconditions.machtigingStatus],
      },
      {
        label: "Gezondheidsverklaring",
        ok:
          !cbrSummary.preconditions.gezondheidsverklaringVereist ||
          cbrSummary.preconditions.gezondheidsverklaringGeregeld,
        value: cbrSummary.preconditions.gezondheidsverklaringVereist
          ? cbrSummary.preconditions.gezondheidsverklaringGeregeld
            ? "Geregeld"
            : "Nog nodig"
          : "Niet vereist",
      },
      {
        label: "Examen / TTT",
        ok: cbrSummary.derived.examStatus === "geslaagd",
        value: CBR_EXAM_STATUS_LABEL[cbrSummary.derived.examStatus],
      },
    ],
    attentionItems: compactTextItems([
      lesson.attention_points,
      lesson.advice,
      lesson.student_note,
      lesson.notes,
      student.notes,
    ]),
    radarItems,
    moduleProgress: studentRisProgress.moduleProgress.map((module) => ({
      moduleNumber: module.moduleNumber,
      progressPct: module.progressPct,
    })),
  };
}

function compactTextItems(values: Array<string | null>): string[] {
  return values
    .flatMap((value) =>
      (value ?? "")
        .split(/\r?\n|;/)
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 8);
}

function durationLabel(lesson: LessonRow) {
  if (lesson.duration_min) return `${lesson.duration_min} minuten`;
  if (!lesson.ends_at) return "Duur onbekend";
  const minutes = Math.round(
    (new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000,
  );
  return `${Math.max(0, minutes)} minuten`;
}

function timeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const timeFmt = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return end ? `${timeFmt.format(start)} - ${timeFmt.format(end)}` : timeFmt.format(start);
}

function InfoLine({
  icon: Icon,
  label,
}: {
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border bg-background/60 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate font-semibold text-foreground">{label}</span>
    </div>
  );
}
