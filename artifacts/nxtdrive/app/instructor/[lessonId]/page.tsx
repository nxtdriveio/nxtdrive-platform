import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTaskLaunchData } from "@/lib/tasks/launch-data";
import { CreateTaskFromEntityButton } from "@/app/backoffice/taken/create-task-button";
import { Card, CardContent } from "@/components/ui/card";
import { InstructorDayList } from "@/components/instructor/DayList";
import { InstructorStudentCard } from "@/components/instructor/StudentCard";
import { InstructorProgressCard } from "@/components/instructor/ProgressCard";
import { InstructorActionsPanel } from "@/components/instructor/ActionsPanel";
import { LessonContextPanel } from "@/components/instructor/LessonContextPanel";
import { TheoryHomeworkPanel } from "@/components/instructor/TheoryHomeworkPanel";
import { AiLessonReport } from "@/components/instructor/AiLessonReport";
import { AiProgressAnalysis } from "@/components/instructor/AiProgressAnalysis";
import { SkillScoring } from "@/components/skills/SkillScoring";
import { ExamReadinessPanel } from "@/components/skills/ExamReadinessPanel";
import { loadVehicles, loadLocations, loadLessonContext } from "@/lib/lessons/context-data";
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

  // Defense-in-depth: instructors may only view their own lessons.
  if (!isAdmin && lesson.instructor_id !== user.id) notFound();

  // Use the lesson's day as the anchor for the day list, so navigation between
  // today's and historical lessons keeps the context consistent.
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

  // Trial lessons (proeflessen) on the same day, so the day list shows the full
  // picture and the instructor cannot double-book over a provisional/confirmed one.
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
  const balance = ((balanceRaw as StudentBalance | null)?.balance ?? 0) as number;

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

  const { data: notesRaw } = await supabase
    .from("lesson_notes")
    .select("*")
    .eq("lesson_id", lesson.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const notes = (notesRaw ?? []) as LessonNote[];

  // Author names for notes (best-effort, via service role).
  const authorIds = Array.from(new Set(notes.map((n) => n.author_user_id)));
  const service = createServiceRoleClient();
  const { data: authorsRaw } = authorIds.length
    ? await service.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const authorMap = new Map(
    ((authorsRaw ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name ?? "Instructeur"],
    ),
  );

  const taskLaunch = await loadTaskLaunchData(service, tenant.id);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem,1fr,20rem]">
      <Card className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-6rem)]">
        <CardContent className="pt-5">
          <InstructorDayList
            lessons={dayLessons}
            studentNames={studentNames}
            trialLessons={dayTrials}
            selectedId={lesson.id}
            date={anchor}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {sp.error ? (
          <Card className="border-danger/40 bg-danger/5">
            <CardContent className="pt-5 text-sm text-danger">
              {decodeURIComponent(sp.error)}
            </CardContent>
          </Card>
        ) : null}

        {student ? (
          <InstructorStudentCard student={student} balance={balance} />
        ) : (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-foreground">
              Leerlinggegevens niet beschikbaar.
            </CardContent>
          </Card>
        )}

        <InstructorActionsPanel
          lessonId={lesson.id}
          isPlanned={lesson.status === "planned"}
          refundPreview={refundPreview}
          hoursBefore={hoursBefore}
          currentScore={lesson.progress_score}
          currentSummary={lesson.progress_summary}
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

        {lesson.progress_summary ? (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Voortgangstoelichting
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {lesson.progress_summary}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Lesnotities
              </div>
              <span className="text-xs text-muted-foreground">
                {notes.length} {notes.length === 1 ? "notitie" : "notities"}
              </span>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen notities voor deze les. Voeg er één toe via{" "}
                <span className="font-medium text-foreground">Notitie</span>.
              </p>
            ) : (
              <ol className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-border bg-card/50 p-3"
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
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <InstructorProgressCard
          lesson={lesson}
          balance={balance}
          progressScore={lesson.progress_score}
        />
        {student ? (
          <ExamReadinessPanel studentId={student.id} readiness={readiness} />
        ) : null}
        {student ? <AiProgressAnalysis lessonId={lesson.id} /> : null}
        {student && taskLaunch.boards.length > 0 ? (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Taak aanmaken
              </div>
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
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Snel
            </div>
            <Link
              href="/instructor"
              className="block rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              ← Terug naar vandaag
            </Link>
            <Link
              href="/instructor/week"
              className="block rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Weekplanning
            </Link>
          </CardContent>
        </Card>
      </div>
      </div>

      <SkillScoring
        lessonId={lesson.id}
        studentName={student?.full_name ?? "Leerling"}
        leskaart={leskaart}
      />
    </div>
  );
}
