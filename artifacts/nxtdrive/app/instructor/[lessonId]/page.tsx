import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FileText,
  StickyNote,
  BookOpen,
  ArrowLeft,
  CalendarDays,
  CheckSquare,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTaskLaunchData } from "@/lib/tasks/launch-data";
import { CreateTaskFromEntityButton } from "@/app/backoffice/taken/create-task-button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import {
  PWACard,
  PWAEmptyState,
  PWAPage,
  PWAPageHeader,
  PWASectionHeader,
} from "@/components/pwa/primitives";
import { InstructorDayList } from "@/components/instructor/DayList";
import { InstructorStudentCard } from "@/components/instructor/StudentCard";
import { InstructorProgressCard } from "@/components/instructor/ProgressCard";
import { InstructorActionsPanel } from "@/components/instructor/ActionsPanel";
import { LessonContextPanel } from "@/components/instructor/LessonContextPanel";
import { TheoryHomeworkPanel } from "@/components/instructor/TheoryHomeworkPanel";
import { AiLessonReport } from "@/components/instructor/AiLessonReport";
import { AiProgressAnalysis } from "@/components/instructor/AiProgressAnalysis";
import { AiInternalAttention } from "@/components/instructor/AiInternalAttention";
import { SkillScoring } from "@/components/skills/SkillScoring";
import { ExamReadinessPanel } from "@/components/skills/ExamReadinessPanel";
import {
  loadVehicles,
  loadLocations,
  loadLessonContext,
} from "@/lib/lessons/context-data";
import { loadTheoryModules, loadLessonTheoryHomework } from "@/lib/theory/data";
import {
  refundPctForHours,
  type CancellationPolicy,
  type Lesson,
  type LessonNote,
} from "@/lib/lessons/types";
import type { Student, StudentBalance } from "@/lib/students/types";
import { loadAgendaTrialLessons } from "@/lib/trial-lessons/agenda";
import { loadInstructorLeskaart } from "@/lib/skills/leskaart-data";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import type { MachtigingStatus } from "@/lib/cbr/types";
import {
  loadCockpitProgress,
  loadCockpitPayment,
} from "@/lib/instructor/cockpit-data";

export const dynamic = "force-dynamic";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

export default async function InstructorLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { lessonId } = await params;
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin = roles.includes("tenant_admin");
  const sp = await searchParams;

  const supabase = await createServerSupabaseClient();

  const { data: lessonRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!lessonRaw) notFound();
  const lesson = lessonRaw as Lesson;

  if (!isAdmin && lesson.instructor_id !== user.id) notFound();

  const anchor = new Date(lesson.starts_at);
  const dayStart = startOfDay(anchor);
  const dayEnd = endOfDay(anchor);

  let dayQuery = supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (!isAdmin) dayQuery = dayQuery.eq("instructor_id", user.id);
  const { data: dayLessonsRaw } = await dayQuery;
  const dayLessons = (dayLessonsRaw ?? []) as Lesson[];

  const dayTrials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    instructorId: isAdmin ? undefined : user.id,
  });

  const studentIds = Array.from(
    new Set([lesson.student_id, ...dayLessons.map((l) => l.student_id)]),
  );
  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, full_name, email, phone, active")
    .in("id", studentIds);
  const studentList = (studentsRaw ?? []) as Pick<
    Student,
    "id" | "full_name" | "email" | "phone" | "active"
  >[];
  const studentMap = new Map(studentList.map((s) => [s.id, s]));
  const studentNames = new Map(studentList.map((s) => [s.id, s.full_name]));
  const student = studentMap.get(lesson.student_id);

  const { data: balanceRaw } = await supabase
    .from("student_credit_balance")
    .select("student_id, balance")
    .eq("student_id", lesson.student_id)
    .maybeSingle();
  const balance = (
    (balanceRaw as StudentBalance | null)?.balance ?? 0
  ) as number;

  const [cockpitProgress, cockpitPayment] = await Promise.all([
    loadCockpitProgress(supabase, tenant.id, lesson.student_id, balance),
    loadCockpitPayment(supabase, tenant.id, lesson.student_id),
  ]);

  const { data: policyRow } = await supabase
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", "cancellation_policy")
    .maybeSingle();
  const policy = (policyRow?.value ?? null) as CancellationPolicy | null;

  const hoursBefore = Math.max(
    0,
    (new Date(lesson.starts_at).getTime() - Date.now()) / (1000 * 60 * 60),
  );
  const refundPct = refundPctForHours(policy, hoursBefore);
  const refundPreview = Math.round((lesson.credits_cost * refundPct) / 100);

  const [
    readiness,
    leskaart,
    vehicles,
    locations,
    lessonContext,
    theoryModules,
    lessonHomework,
  ] = await Promise.all([
    loadStudentReadiness(supabase, tenant.id, lesson.student_id),
    loadInstructorLeskaart(supabase, tenant.id, lesson.student_id, lesson.id),
    loadVehicles(supabase, tenant.id, { activeOnly: true }),
    loadLocations(supabase, tenant.id, { activeOnly: true }),
    loadLessonContext(supabase, tenant.id, lesson.id),
    loadTheoryModules(supabase, tenant.id, { activeOnly: true }),
    loadLessonTheoryHomework(supabase, tenant.id, lesson.id),
  ]);

  const { data: cbrStatusRow } = await supabase
    .from("student_cbr_status")
    .select("machtiging_status, machtiging_geregeld")
    .eq("tenant_id", tenant.id)
    .eq("student_id", lesson.student_id)
    .maybeSingle();
  const machtigingStatus: MachtigingStatus =
    (cbrStatusRow?.machtiging_status as MachtigingStatus | undefined) ??
    (cbrStatusRow?.machtiging_geregeld ? "ontvangen" : "nog_nodig");

  const { data: notesRaw } = await supabase
    .from("lesson_notes")
    .select("*")
    .eq("lesson_id", lesson.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const notes = (notesRaw ?? []) as LessonNote[];

  const authorIds = Array.from(new Set(notes.map((n) => n.author_user_id)));
  const service = createServiceRoleClient();
  const { data: authorsRaw } = authorIds.length
    ? await service
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds)
    : { data: [] };
  const authorMap = new Map(
    (
      (authorsRaw ?? []) as { id: string; full_name: string | null }[]
    ).map((p) => [p.id, p.full_name ?? "Instructeur"]),
  );

  const taskLaunch = await loadTaskLaunchData(service, tenant.id);

  return (
    <PWAPage app="instructor" contentClassName="flex flex-col gap-4">
      <PWAPageHeader
        eyebrow="Lescockpit"
        title={student?.full_name ?? "Lesdetails"}
        description="Werk deze les af vanuit een rustige cockpit: context, voortgang, acties, theorie en aandachtspunten op een plek."
        align="left"
      />
      {/* ── Mobile only: horizontal agenda chip strip ────────────────────── */}
      <div className="md:hidden">
        <PWACard>
          <InstructorDayList
            lessons={dayLessons}
            studentNames={studentNames}
            trialLessons={dayTrials}
            date={anchor}
            variant="horizontal"
          />
        </PWACard>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {sp.error ? (
        <Alert variant="danger">
          {decodeURIComponent(sp.error)}
        </Alert>
      ) : null}

      {/* ── Student card + Progress card (side-by-side on large screens) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {student ? (
          <InstructorStudentCard student={student} />
        ) : (
          <PWACard>
            <PWAEmptyState message="Leerlinggegevens niet beschikbaar." />
          </PWACard>
        )}
        <InstructorProgressCard
          lesson={lesson}
          progressScore={lesson.progress_score}
          progress={cockpitProgress}
          payment={cockpitPayment}
        />
      </div>

      {/* ── Primary actions ──────────────────────────────────────────────── */}
      <InstructorActionsPanel
        lessonId={lesson.id}
        studentId={lesson.student_id}
        studentName={student?.full_name ?? "Leerling"}
        studentPhone={student?.phone ?? null}
        status={lesson.status}
        refundPreview={refundPreview}
        hoursBefore={hoursBefore}
        currentScore={lesson.progress_score}
        currentSummary={lesson.progress_summary}
        leskaart={leskaart}
      />

      <LessonContextPanel
        lessonId={lesson.id}
        vehicles={vehicles}
        locations={locations}
        leskaart={leskaart}
        context={lessonContext}
      />

      <TheoryHomeworkPanel
        lessonId={lesson.id}
        modules={theoryModules}
        homework={lessonHomework}
      />

      <AiLessonReport lessonId={lesson.id} />

      {/* ── Voortgangstoelichting ─────────────────────────────────────────  */}
      {lesson.progress_summary ? (
        <PWACard>
          <PWASectionHeader
            icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
          >
            Voortgangstoelichting
          </PWASectionHeader>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {lesson.progress_summary}
          </p>
        </PWACard>
      ) : null}

      {/* ── Lesnotities ──────────────────────────────────────────────────── */}
      <PWACard>
        <PWASectionHeader
          icon={<StickyNote className="h-3.5 w-3.5" aria-hidden />}
          right={
            <span>
              {notes.length} {notes.length === 1 ? "notitie" : "notities"}
            </span>
          }
        >
          Lesnotities
        </PWASectionHeader>
        {notes.length === 0 ? (
          <PWAEmptyState
            icon={<StickyNote className="h-8 w-8" aria-hidden />}
            title="Nog geen notities"
            message={`Voeg een notitie toe via de knop "Notitie" hierboven.`}
          />
        ) : (
          <ol className="space-y-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-xl border border-border bg-card/50 p-3"
              >
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{authorMap.get(n.author_user_id) ?? "—"}</span>
                  <span>{dtFmt.format(new Date(n.created_at))}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {n.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </PWACard>

      {student ? (
        <ExamReadinessPanel
          studentId={student.id}
          readiness={readiness}
          machtigingStatus={machtigingStatus}
        />
      ) : null}
      {student ? <AiProgressAnalysis lessonId={lesson.id} /> : null}
      {student ? <AiInternalAttention lessonId={lesson.id} /> : null}

      {/* ── Taak aanmaken ─────────────────────────────────────────────────  */}
      {student && taskLaunch.boards.length > 0 ? (
        <PWACard>
          <PWASectionHeader
            icon={<CheckSquare className="h-3.5 w-3.5" aria-hidden />}
          >
            Taak aanmaken
          </PWASectionHeader>
          <div className="flex flex-wrap gap-2">
            <CreateTaskFromEntityButton
              entityType="lesson"
              entityId={lesson.id}
              entityLabel={`${dtFmt.format(new Date(lesson.starts_at))} — ${student.full_name}`}
              boards={taskLaunch.boards}
              members={taskLaunch.members}
              label="Les-taak"
            />
            <CreateTaskFromEntityButton
              entityType="exam"
              entityId={student.id}
              entityLabel={student.full_name}
              boards={taskLaunch.boards}
              members={taskLaunch.members}
              label="Examen-taak"
            />
          </div>
        </PWACard>
      ) : null}

      {/* ── Snel ─────────────────────────────────────────────────────────── */}
      <PWACard>
        <PWASectionHeader
          icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
        >
          Snel
        </PWASectionHeader>
        <div className="space-y-2">
          <Link
            href="/instructor"
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Terug naar vandaag
          </Link>
          <Link
            href="/instructor/week"
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Weekplanning
          </Link>
        </div>
      </PWACard>

      <SkillScoring
        lessonId={lesson.id}
        studentName={student?.full_name ?? "Leerling"}
        leskaart={leskaart}
      />
    </PWAPage>
  );
}
