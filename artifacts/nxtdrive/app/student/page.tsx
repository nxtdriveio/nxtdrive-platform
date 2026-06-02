import Link from "next/link";
import { CalendarDays, GraduationCap } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StudentLessonCard } from "@/components/student/LessonCard";
import { StudentBalanceCard } from "@/components/student/BalanceCard";
import { StudentReadinessCard } from "@/components/skills/StudentReadinessCard";
import { StudentCategoryProgressCard } from "@/components/skills/StudentCategoryProgressCard";
import { StudentTrendCard } from "@/components/skills/StudentTrendCard";
import { RecentPracticeCard } from "@/components/skills/RecentPracticeCard";
import { StudentTheoryHomeworkCard } from "@/components/student/TheoryHomeworkCard";
import { getActiveStudent } from "@/lib/students/access";
import { RefillInvitations } from "@/components/student/refill-invitations";
import { listOpenInvitationsForStudent } from "@/lib/lesson-refill/invitations";
import { loadStudentTheoryHomework } from "@/lib/theory/data";
import { getInstructorNames } from "@/lib/students/instructor-names";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadStudentLeskaart } from "@/lib/skills/student-leskaart-data";
import type { Lesson } from "@/lib/lessons/types";
import type { StudentBalance } from "@/lib/students/types";

export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWindow(days: number): Date {
  const x = startOfToday();
  x.setDate(x.getDate() + days);
  return x;
}

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
  const todayIso = startOfToday().toISOString();
  const weekEndIso = endOfWindow(7).toISOString();

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

  // Komende 7 dagen: alle lessen vanaf vandaag tot +7 dagen.
  const { data: upcomingRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", student.id)
    .gte("starts_at", todayIso)
    .lt("starts_at", weekEndIso)
    .order("starts_at", { ascending: true });
  const upcoming = ((upcomingRaw ?? []) as Lesson[]).filter(
    (l) => l.id !== nextLesson?.id,
  );

  const { data: balanceRow } = await supabase
    .from("student_credit_balance")
    .select("student_id, balance")
    .eq("student_id", student.id)
    .maybeSingle();
  const balance = ((balanceRow as StudentBalance | null)?.balance ?? 0) as number;

  const [readiness, leskaart, homework, refillInvitations] = await Promise.all([
    loadStudentReadiness(supabase, tenant.id, student.id),
    loadStudentLeskaart(supabase, tenant.id, student.id),
    loadStudentTheoryHomework(supabase, tenant.id, student.id),
    listOpenInvitationsForStudent(supabase, tenant.id, student.id),
  ]);

  const instructorNames = await getInstructorNames([
    ...(nextLesson ? [nextLesson.instructor_id] : []),
    ...upcoming.map((l) => l.instructor_id),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Hallo
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          {student.full_name.split(" ")[0]}
        </h1>
      </div>

      <RefillInvitations invitations={refillInvitations} />

      {nextLesson ? (
        <Card className="border-primary/40 bg-primary-soft/40">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Volgende les
            </div>
            <StudentLessonCard
              lesson={nextLesson}
              showDate
              instructorName={instructorNames.get(nextLesson.instructor_id)}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Volgende les
            </div>
            <p className="text-sm text-muted-foreground">
              Er staat geen les gepland. Neem contact op met je rijschool om
              een les in te plannen.
            </p>
          </CardContent>
        </Card>
      )}

      <StudentReadinessCard readiness={readiness} />

      <StudentTheoryHomeworkCard homework={homework} emptyHint={false} />

      {leskaart.recent ? (
        <RecentPracticeCard recent={leskaart.recent} />
      ) : null}

      <StudentCategoryProgressCard categories={leskaart.categories} />

      <StudentTrendCard history={leskaart.history} />

      <StudentBalanceCard balance={balance} />

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden />
              Komende lessen
            </div>
            <Link
              href="/student/lessons"
              className="text-xs text-primary hover:underline"
            >
              Alles bekijken
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen andere geplande lessen.
            </p>
          ) : (
            <ol className="space-y-2">
              {upcoming.map((l) => (
                <li key={l.id}>
                  <StudentLessonCard
                    lesson={l}
                    showDate
                    instructorName={instructorNames.get(l.instructor_id)}
                  />
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/student/lessons"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            Lessen overzicht
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
