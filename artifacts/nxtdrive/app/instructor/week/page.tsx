import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  LESSON_IN_PROGRESS_CARD,
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import { cn } from "@/lib/utils";
import type { Student } from "@/lib/students/types";
import {
  loadAgendaTrialLessons,
  type AgendaTrialLesson,
} from "@/lib/trial-lessons/agenda";
import {
  loadAgendaAppointments,
  type AgendaAppointmentView,
} from "@/lib/agenda/appointments";
import { TrialLessonCard } from "@/components/agenda/trial-lesson-card";
import { AppointmentCard } from "@/components/agenda/appointment-card";
import { AvailabilityBanner } from "@/components/agenda/availability-banner";
import { loadFreeSpaceForRange } from "@/lib/availability/service";
import { dateKey } from "@/lib/availability/compute";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function startOfWeek(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  return value;
}

export default async function InstructorWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { user, tenant } = await requireActiveTenant(["instructor"]);
  const params = await searchParams;

  const anchor = params.week ? new Date(params.week) : new Date();
  const weekStart = startOfWeek(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(weekStart.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(weekStart.getDate() + 7);

  const supabase = await createServerSupabaseClient();
  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .gte("starts_at", weekStart.toISOString())
    .lt("starts_at", weekEnd.toISOString())
    .order("starts_at", { ascending: true });
  const lessons = (lessonsRaw ?? []) as Lesson[];

  const trials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    instructorId: user.id,
  });

  const appointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    instructorId: user.id,
  });

  const freeSpace = await loadFreeSpaceForRange(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
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

  type AgendaItem =
    | { kind: "lesson"; starts_at: string; lesson: Lesson }
    | { kind: "trial"; starts_at: string; trial: AgendaTrialLesson }
    | { kind: "appointment"; starts_at: string; appointment: AgendaAppointmentView };

  const days: { date: Date; items: AgendaItem[] }[] = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    days.push({ date, items: [] });
  }

  const dayIndex = (startsAt: string) =>
    Math.floor((new Date(startsAt).getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));

  for (const lesson of lessons) {
    const index = dayIndex(lesson.starts_at);
    if (index >= 0 && index < 7) {
      days[index]?.items.push({ kind: "lesson", starts_at: lesson.starts_at, lesson });
    }
  }
  for (const trial of trials) {
    const index = dayIndex(trial.starts_at);
    if (index >= 0 && index < 7) {
      days[index]?.items.push({ kind: "trial", starts_at: trial.starts_at, trial });
    }
  }
  for (const appointment of appointments) {
    const index = dayIndex(appointment.starts_at);
    if (index >= 0 && index < 7) {
      days[index]?.items.push({ kind: "appointment", starts_at: appointment.starts_at, appointment });
    }
  }
  for (const day of days) {
    day.items.sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  }

  return (
    <PWAPage app="instructor">
      <Link
        href="/instructor"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar vandaag
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PWAPageHeader
          title="Weekplanning"
          subtitle={`${dayFmt.format(weekStart)} - ${dayFmt.format(new Date(weekEnd.getTime() - 1))}`}
          className="mb-0"
          align="wide"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/instructor/week?week=${prevWeek.toISOString()}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Vorige
          </Link>
          <Link href="/instructor/week" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Deze week
          </Link>
          <Link href={`/instructor/week?week=${nextWeek.toISOString()}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Volgende
          </Link>
          <Link href="/instructor/afspraak/nieuw" className={buttonVariants({ variant: "outline", size: "sm" })}>
            + Afspraak
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-7">
        {days.map((day) => (
          <Card key={day.date.toISOString()} className="overflow-hidden">
            <CardContent className="space-y-2 pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dayFmt.format(day.date)}
              </div>
              <AvailabilityBanner intervals={freeSpace.get(dateKey(day.date)) ?? []} />
              {day.items.length === 0 ? (
                <div className="text-xs text-muted-foreground">Geen afspraken</div>
              ) : (
                <ul className="space-y-1.5">
                  {day.items.map((item) =>
                    item.kind === "lesson" ? (
                      <li key={`lesson-${item.lesson.id}`}>
                        <Link
                          href={`/instructor/${item.lesson.id}`}
                          className={cn(
                            "block rounded-md border px-2 py-1.5 text-xs transition-colors",
                            item.lesson.status === "in_progress"
                              ? LESSON_IN_PROGRESS_CARD
                              : "border-border bg-card hover:border-primary",
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-foreground">
                              {timeFmt.format(new Date(item.lesson.starts_at))}
                            </span>
                            <Badge variant={LESSON_STATUS_VARIANT[item.lesson.status]}>
                              {LESSON_STATUS_LABEL[item.lesson.status]}
                            </Badge>
                          </div>
                          <div className="mt-1 truncate text-muted-foreground">
                            {studentNames.get(item.lesson.student_id) ?? "Leerling"}
                          </div>
                        </Link>
                      </li>
                    ) : item.kind === "trial" ? (
                      <li key={`trial-${item.trial.id}`}>
                        <TrialLessonCard
                          leadId={item.trial.lead_id}
                          leadName={item.trial.lead_name}
                          startsAt={item.trial.starts_at}
                          status={item.trial.status}
                        />
                      </li>
                    ) : (
                      <li key={`appointment-${item.appointment.id}`}>
                        <AppointmentCard
                          id={item.appointment.id}
                          type={item.appointment.type}
                          startsAt={item.appointment.starts_at}
                          endsAt={item.appointment.ends_at}
                          title={item.appointment.title}
                          location={item.appointment.location}
                          studentName={item.appointment.student_name}
                          href={`/instructor/afspraak/${item.appointment.id}`}
                        />
                      </li>
                    ),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PWAPage>
  );
}
