import Link from "next/link";
import { CalendarPlus, ChevronLeft, Clock3 } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { Lesson } from "@/lib/lessons/types";
import type { Student } from "@/lib/students/types";
import {
  loadAgendaTrialLessons,
  type AgendaTrialLesson,
} from "@/lib/trial-lessons/agenda";
import {
  loadAgendaAppointments,
  type AgendaAppointmentView,
} from "@/lib/agenda/appointments";
import { cn } from "@/lib/utils";
import { PWACard, PWAEmptyState, PWAPage, PWAPageHeader } from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const dayLongFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const TIME_SLOTS = [6, 7, 8, 9, 10, 11, 12] as const;

function startOfWeek(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  return value;
}

type AgendaItem =
  | {
      kind: "lesson";
      id: string;
      startsAt: string;
      href: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeVariant: "primary" | "info";
    }
  | {
      kind: "trial";
      id: string;
      startsAt: string;
      href: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeVariant: "warning";
    }
  | {
      kind: "appointment";
      id: string;
      startsAt: string;
      href: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeVariant: "outline";
    };

function itemHour(item: AgendaItem): number {
  return new Date(item.startsAt).getHours();
}

function withinMorningWindow(item: AgendaItem): boolean {
  const hour = itemHour(item);
  return hour >= TIME_SLOTS[0] && hour <= TIME_SLOTS[TIME_SLOTS.length - 1];
}

function slotLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
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

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return { date, items: [] as AgendaItem[] };
  });

  const dayIndex = (startsAt: string) =>
    Math.floor((new Date(startsAt).getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));

  for (const lesson of lessons) {
    const index = dayIndex(lesson.starts_at);
    if (index >= 0 && index < 7) {
      days[index]?.items.push({
        kind: "lesson",
        id: lesson.id,
        startsAt: lesson.starts_at,
        href: `/instructor/${lesson.id}`,
        title: studentNames.get(lesson.student_id) ?? "Leerling",
        subtitle: lesson.location ?? "Leslocatie volgt",
        badge: "Les",
        badgeVariant: lesson.status === "in_progress" ? "info" : "primary",
      });
    }
  }

  for (const trial of trials) {
    const index = dayIndex(trial.starts_at);
    if (index >= 0 && index < 7) {
      days[index]?.items.push({
        kind: "trial",
        id: trial.id,
        startsAt: trial.starts_at,
        href: `/backoffice/leads/${trial.lead_id}`,
        title: trial.lead_name,
        subtitle: trial.pickup_location ?? "Proefleslocatie volgt",
        badge: "Proefles",
        badgeVariant: "warning",
      });
    }
  }

  for (const appointment of appointments) {
    const index = dayIndex(appointment.starts_at);
    if (index >= 0 && index < 7) {
      days[index]?.items.push({
        kind: "appointment",
        id: appointment.id,
        startsAt: appointment.starts_at,
        href: `/instructor/afspraak/${appointment.id}`,
        title: appointment.student_name ?? appointment.title?.trim() ?? "Agenda-item",
        subtitle: appointment.location ?? "Blok zonder locatie",
        badge: "Afspraak",
        badgeVariant: "outline",
      });
    }
  }

  for (const day of days) {
    day.items.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  const totalMorningItems = days.reduce(
    (sum, day) => sum + day.items.filter(withinMorningWindow).length,
    0,
  );
  const totalLaterItems = days.reduce(
    (sum, day) => sum + day.items.filter((item) => !withinMorningWindow(item)).length,
    0,
  );

  return (
    <PWAPage app="instructor" contentClassName="space-y-5 xl:space-y-6">
      <PWAPageHeader
        eyebrow="Planning"
        title="Weekplanning"
        description="Een horizontale weekcockpit met ochtendblokken van 06:00 tot 12:00. Alles later op de dag blijft hieronder zichtbaar als vervolg."
        align="left"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/instructor"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Terug naar vandaag
            </Link>
            <Link
              href="/instructor/afspraak/nieuw"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Agenda-afspraak
            </Link>
            <Link
              href="/backoffice/agenda/nieuw"
              className={buttonVariants({ size: "sm" })}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Les plannen
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/instructor/week?week=${prevWeek.toISOString()}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Vorige week
        </Link>
        <Link href="/instructor/week" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Deze week
        </Link>
        <Link href={`/instructor/week?week=${nextWeek.toISOString()}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Volgende week
        </Link>
        <span className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
          {dayFmt.format(weekStart)} - {dayFmt.format(new Date(weekEnd.getTime() - 1))}
        </span>
      </div>

      <PWACard
        title="Ochtendboard"
        className="bg-card"
        headerRight={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{totalMorningItems} blokken tussen 06:00 en 12:00</span>
            {totalLaterItems > 0 ? <span>{totalLaterItems} later op de dag</span> : null}
          </div>
        }
        contentClassName="space-y-4 px-0 py-0"
      >
        <div className="overflow-x-auto">
          <div className="min-w-[72rem]">
            <div
              className="grid"
              style={{ gridTemplateColumns: "5.25rem repeat(7, minmax(0, 1fr))" }}
            >
              <div className="border-b border-border/70 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Tijd
              </div>
              {days.map((day) => {
                const morningCount = day.items.filter(withinMorningWindow).length;
                return (
                  <div
                    key={day.date.toISOString()}
                    className="border-b border-l border-border/70 px-3 py-3"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {dayFmt.format(day.date)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dayLongFmt.format(day.date)}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {morningCount === 0 ? "Rustige ochtend" : `${morningCount} items in ochtend`}
                    </p>
                  </div>
                );
              })}

              {TIME_SLOTS.map((hour) => (
                <div key={hour} className="contents">
                  <div className="flex min-h-28 items-start border-b border-border/70 px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden />
                      {slotLabel(hour)}
                    </span>
                  </div>
                  {days.map((day) => {
                    const slotItems = day.items.filter((item) => itemHour(item) === hour);
                    return (
                      <div
                        key={`${day.date.toISOString()}-${hour}`}
                        className="min-h-28 border-b border-l border-border/70 px-2 py-2"
                      >
                        {slotItems.length === 0 ? (
                          <div className="h-full rounded-xl border border-dashed border-border/70 bg-background/35" />
                        ) : (
                          <div className="space-y-2">
                            {slotItems.map((item) => (
                              <Link
                                key={item.id}
                                href={item.href}
                                className="block rounded-2xl border border-border/80 bg-background px-3 py-2.5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                      {item.title}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {timeFmt.format(new Date(item.startsAt))}
                                    </p>
                                  </div>
                                  <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {item.subtitle}
                                </p>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </PWACard>

      <div className="grid gap-5 xl:grid-cols-2">
        {days.map((day) => {
          const laterItems = day.items.filter((item) => !withinMorningWindow(item));
          return (
            <PWACard
              key={`later-${day.date.toISOString()}`}
              title={`Later op ${dayFmt.format(day.date)}`}
              className="bg-card"
              contentClassName="space-y-3"
            >
              {laterItems.length === 0 ? (
                <PWAEmptyState
                  message="Na 12:00 staat hier voor deze dag nog niets extra's ingepland."
                  className="min-h-[7rem] p-4"
                />
              ) : (
                <div className="space-y-2">
                  {laterItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-background px-3.5 py-3 transition hover:border-primary/40 hover:shadow-sm",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {timeFmt.format(new Date(item.startsAt))} · {item.subtitle}
                        </p>
                      </div>
                      <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </PWACard>
          );
        })}
      </div>
    </PWAPage>
  );
}
