import Link from "next/link";
import { CalendarDays, GraduationCap } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StudentLessonCard } from "@/components/student/LessonCard";
import { StudentBalanceCard } from "@/components/student/BalanceCard";
import { CbrReadinessCard } from "@/components/cbr/ReadinessCard";
import { getActiveStudent } from "@/lib/students/access";
import { getInstructorNames } from "@/lib/students/instructor-names";
import type { Lesson } from "@/lib/lessons/types";
import type { StudentBalance } from "@/lib/students/types";
import {
  buildChecklist,
  type CbrCompetency,
  type StudentCbrProgressRow,
} from "@/lib/cbr/types";

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

  const [competenciesRes, progressRes] = await Promise.all([
    supabase
      .from("cbr_competencies")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("student_cbr_progress")
      .select("*")
      .eq("student_id", student.id),
  ]);
  const checklist = buildChecklist(
    (competenciesRes.data ?? []) as CbrCompetency[],
    (progressRes.data ?? []) as StudentCbrProgressRow[],
  );

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

      <StudentBalanceCard balance={balance} />

      <CbrReadinessCard items={checklist} />

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
