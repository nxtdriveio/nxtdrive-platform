import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
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

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

export default async function InstructorWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const sp = await searchParams;

  const anchor = sp.week ? new Date(sp.week) : new Date();
  const weekStart = startOfWeek(isNaN(anchor.getTime()) ? new Date() : anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(weekStart.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(weekStart.getDate() + 7);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .gte("starts_at", weekStart.toISOString())
    .lt("starts_at", weekEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (!roles.includes("tenant_admin")) {
    query = query.eq("instructor_id", user.id);
  }
  const { data: lessonsRaw } = await query;
  const lessons = (lessonsRaw ?? []) as Lesson[];

  const trials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    instructorId: roles.includes("tenant_admin") ? undefined : user.id,
  });

  const appointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    instructorId: roles.includes("tenant_admin") ? undefined : user.id,
  });

  // Background availability: own schedule (or union across instructors for admins).
  const freeSpace = await loadFreeSpaceForRange(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    instructorId: roles.includes("tenant_admin") ? undefined : user.id,
  });

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

  // Interleave lessons and active trial lessons per day, sorted by start time.
  type AgendaItem =
    | { kind: "lesson"; starts_at: string; lesson: Lesson }
    | { kind: "trial"; starts_at: string; trial: AgendaTrialLesson }
    | { kind: "appointment"; starts_at: string; appointment: AgendaAppointmentView };

  const days: { date: Date; items: AgendaItem[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push({ date: d, items: [] });
  }
  const dayIndex = (startsAt: string) =>
    Math.floor(
      (new Date(startsAt).getTime() - weekStart.getTime()) /
        (1000 * 60 * 60 * 24),
    );
  for (const l of lessons) {
    const idx = dayIndex(l.starts_at);
    if (idx >= 0 && idx < 7)
      days[idx]!.items.push({ kind: "lesson", starts_at: l.starts_at, lesson: l });
  }
  for (const t of trials) {
    const idx = dayIndex(t.starts_at);
    if (idx >= 0 && idx < 7)
      days[idx]!.items.push({ kind: "trial", starts_at: t.starts_at, trial: t });
  }
  for (const a of appointments) {
    const idx = dayIndex(a.starts_at);
    if (idx >= 0 && idx < 7)
      days[idx]!.items.push({
        kind: "appointment",
        starts_at: a.starts_at,
        appointment: a,
      });
  }
  for (const day of days) {
    day.items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  return (
    <div className="space-y-4">
      <Link
        href="/instructor"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar vandaag
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Weekplanning
          </h1>
          <p className="text-sm text-muted-foreground">
            {dayFmt.format(weekStart)} — {dayFmt.format(
              new Date(weekEnd.getTime() - 1),
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/instructor/week?week=${prevWeek.toISOString()}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ← Vorige
          </Link>
          <Link
            href="/instructor/week"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Deze week
          </Link>
          <Link
            href={`/instructor/week?week=${nextWeek.toISOString()}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Volgende →
          </Link>
          <Link
            href="/instructor/afspraak/nieuw"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            + Afspraak
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => (
          <Card key={day.date.toISOString()}>
            <CardContent className="space-y-2 pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dayFmt.format(day.date)}
              </div>
              <AvailabilityBanner
                intervals={freeSpace.get(dateKey(day.date)) ?? []}
              />
              {day.items.length === 0 ? (
                <div className="text-xs text-muted-foreground">—</div>
              ) : (
                <ul className="space-y-1.5">
                  {day.items.map((item) =>
                    item.kind === "lesson" ? (
                      <li key={`lesson-${item.lesson.id}`}>
                        <Link
                          href={`/instructor/${item.lesson.id}`}
                          className="block rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:border-primary"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-foreground">
                              {timeFmt.format(new Date(item.lesson.starts_at))}
                            </span>
                            <Badge
                              variant={LESSON_STATUS_VARIANT[item.lesson.status]}
                            >
                              {LESSON_STATUS_LABEL[item.lesson.status]}
                            </Badge>
                          </div>
                          <div className="mt-1 truncate text-muted-foreground">
                            {studentNames.get(item.lesson.student_id) ??
                              "Leerling"}
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
                      <li key={`appt-${item.appointment.id}`}>
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
    </div>
  );
}
