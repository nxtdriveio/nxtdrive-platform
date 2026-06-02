import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { InstructorDayList } from "@/components/instructor/DayList";
import type { Lesson } from "@/lib/lessons/types";
import type { Student } from "@/lib/students/types";
import { loadAgendaTrialLessons } from "@/lib/trial-lessons/agenda";

export const dynamic = "force-dynamic";

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

export default async function InstructorIndexPage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });

  // Instructors see only their own lessons; tenant_admin sees all.
  if (!roles.includes("tenant_admin")) {
    query = query.eq("instructor_id", user.id);
  }
  const { data: lessonsRaw } = await query;
  const lessons = (lessonsRaw ?? []) as Lesson[];

  // Auto-jump to the first planned lesson of today (or earliest lesson if none planned).
  const target =
    lessons.find((l) => l.status === "planned") ?? lessons[0] ?? null;
  if (target) redirect(`/instructor/${target.id}`);

  // No lessons today, but there may still be trial lessons (proeflessen) to show.
  const trials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    instructorId: roles.includes("tenant_admin") ? undefined : user.id,
  });

  // Empty state — no lessons today.
  const studentIds = Array.from(new Set(lessons.map((l) => l.student_id)));
  const { data: studentsRaw } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map((s) => [
      s.id,
      s.full_name,
    ]),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <InstructorDayList
            lessons={lessons}
            studentNames={studentNames}
            trialLessons={trials}
            date={today}
          />
          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            {trials.length > 0
              ? "Geen reguliere lessen vandaag, wel een of meer proeflessen. "
              : "Geen lessen voor vandaag. "}
            Bekijk de{" "}
            <Link
              href="/instructor/week"
              className="text-primary hover:underline"
            >
              weekplanning
            </Link>{" "}
            voor de rest van de week.
          </div>
          <Link
            href="/instructor/week"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            Weekplanning openen
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
