import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarRange } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { InstructorDayList } from "@/components/instructor/DayList";
import type { Lesson } from "@/lib/lessons/types";
import type { Student } from "@/lib/students/types";
import { loadAgendaTrialLessons } from "@/lib/trial-lessons/agenda";
import { loadAgendaAppointments } from "@/lib/agenda/appointments";
import { PWAPage, PWAEmptyState, PWAHero, PWAKpiGrid, PWAKpiTile } from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = startOfDay(date);
  value.setDate(value.getDate() + 1);
  return value;
}

export default async function InstructorIndexPage() {
  const { user, tenant } = await requireActiveTenant(["instructor"]);

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const supabase = await createServerSupabaseClient();
  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });

  const lessons = (lessonsRaw ?? []) as Lesson[];
  const target = lessons.find((lesson) => lesson.status === "planned") ?? lessons[0] ?? null;
  if (target) redirect(`/instructor/${target.id}`);

  const trials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    instructorId: user.id,
  });

  const appointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    instructorId: user.id,
  });

  const studentIds = Array.from(new Set(lessons.map((lesson) => lesson.student_id)));
  const { data: studentsRaw } = studentIds.length
    ? await supabase.from("students").select("id, full_name").in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map((student) => [
      student.id,
      student.full_name,
    ]),
  );

  const agendaCount = lessons.length + trials.length + appointments.length;

  return (
    <PWAPage app="instructor">
      <PWAHero
        app="instructor"
        eyebrow={tenant.name}
        title="Vandaag"
        subtitle="Een tablet-first cockpit voor je dagritme, afspraken en lesfocus. Je opent direct de eerstvolgende les zodra die bestaat."
        aside={
          <PWAKpiGrid compact className="w-full min-w-0 max-w-md">
            <PWAKpiTile label="Reguliere lessen" value={lessons.length} hint="Vandaag gepland" />
            <PWAKpiTile label="Totale agenda" value={agendaCount} hint="Lessen, proeflessen en blokken" />
          </PWAKpiGrid>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/instructor/week" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <CalendarRange className="h-4 w-4" aria-hidden />
          Weekplanning openen
        </Link>
      </div>

      <div className="rounded-[1.5rem] border border-border/70 bg-card/88 p-4 shadow-sm backdrop-blur">
        {agendaCount > 0 ? (
          <InstructorDayList
            lessons={lessons}
            studentNames={studentNames}
            trialLessons={trials}
            appointments={appointments}
            date={today}
          />
        ) : (
          <PWAEmptyState
            icon={<CalendarDays className="h-8 w-8" aria-hidden />}
            title="Rustige dag"
            message="Er staan vandaag geen lessen of andere afspraken voor je klaar. Bekijk de weekplanning om vooruit te werken."
          />
        )}
      </div>
    </PWAPage>
  );
}
