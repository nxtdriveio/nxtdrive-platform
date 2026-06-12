import { redirect } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  GraduationCap,
  MapPin,
  NotebookPen,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PWAPage, PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import { getActiveStudent } from "@/lib/students/access";
import { getInstructorNames } from "@/lib/students/instructor-names";
import type { Lesson } from "@/lib/lessons/types";
import {
  APPOINTMENT_TYPE_SHORT,
  type AgendaAppointment,
} from "@/lib/agenda/types";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
  StudentShowcaseTabs,
} from "@/components/student/Showcase";
import { createNlDateTimeFormatter, isSameAmsterdamDay } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const dateFmt = createNlDateTimeFormatter({
  weekday: "short",
  day: "numeric",
  month: "short",
});

const longDateFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "numeric",
  month: "long",
});

const monthTitleFmt = createNlDateTimeFormatter({
  month: "long",
  year: "numeric",
});

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

type LessonsTab = "lessons" | "exams" | "planning";

type PlannerItem = {
  id: string;
  kind: "lesson" | "appointment";
  startsAt: string;
  endsAt: string;
  title: string;
  subtitle: string;
  location: string | null;
  href: string;
  badgeLabel: string;
  badgeVariant: "primary" | "success" | "warning" | "outline";
};

function lessonsTabFrom(value: string | undefined): LessonsTab {
  return value === "exams" || value === "planning" ? value : "lessons";
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseSelectedDate(input: string | undefined): Date {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date();
  const [year, month, day] = input.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function summarizeLessonFeedback(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const compact = summary.replace(/\s+/g, " ").trim();
  if (compact.length <= 108) return compact;
  return `${compact.slice(0, 105).trimEnd()}...`;
}

function plannerItemsForLessons(
  lessons: Lesson[],
  instructorNames: Map<string, string>,
): PlannerItem[] {
  return lessons.map((lesson) => ({
    id: lesson.id,
    kind: "lesson",
    startsAt: lesson.starts_at,
    endsAt: lesson.ends_at,
    title: instructorNames.get(lesson.instructor_id) ?? "Rijles",
    subtitle: lesson.location ?? "Locatie volgt",
    location: lesson.location,
    href: `/student/lessons/${lesson.id}`,
    badgeLabel: lesson.status === "completed" ? "Afgerond" : "Rijles",
    badgeVariant: lesson.status === "completed" ? "success" : "primary",
  }));
}

function plannerItemsForAppointments(appointments: AgendaAppointment[]): PlannerItem[] {
  return appointments.map((appointment) => ({
    id: appointment.id,
    kind: "appointment",
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    title: APPOINTMENT_TYPE_SHORT[appointment.type],
    subtitle: appointment.title ?? appointment.location ?? "Afspraak",
    location: appointment.location,
    href: "/student/cbr",
    badgeLabel: appointment.status === "completed" ? "Afgerond" : "Gepland",
    badgeVariant: appointment.status === "completed" ? "success" : "warning",
  }));
}

function monthGrid(selectedDate: Date) {
  const firstDay = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1,
    12,
    0,
    0,
    0,
  );
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default async function StudentLessonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeTab = lessonsTabFrom(
    typeof params.tab === "string" ? params.tab : undefined,
  );
  const selectedDate = parseSelectedDate(
    typeof params.date === "string" ? params.date : undefined,
  );

  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <Card>
        <CardContent className="pt-6">
          <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  const [upcomingRes, pastRes, appointmentsRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("student_id", student.id)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true }),
    supabase
      .from("lessons")
      .select("*")
      .eq("student_id", student.id)
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(12),
    supabase
      .from("agenda_appointments")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("student_id", student.id)
      .order("starts_at", { ascending: true }),
  ]);

  if (upcomingRes.error) {
    throw new Error(`Komende lessen laden mislukt: ${upcomingRes.error.message}`);
  }
  if (pastRes.error) {
    throw new Error(`Lesgeschiedenis laden mislukt: ${pastRes.error.message}`);
  }
  if (appointmentsRes.error) {
    throw new Error(`Afspraken laden mislukt: ${appointmentsRes.error.message}`);
  }

  const upcoming = (upcomingRes.data ?? []) as Lesson[];
  const past = (pastRes.data ?? []) as Lesson[];
  const appointments = (appointmentsRes.data ?? []) as AgendaAppointment[];
  const instructorNames = await getInstructorNames([
    ...upcoming.map((lesson) => lesson.instructor_id),
    ...past.map((lesson) => lesson.instructor_id),
  ]);

  const examAppointments = appointments.filter(
    (appointment) => appointment.type === "exam" || appointment.type === "interim_test",
  );
  const plannerItems = [
    ...plannerItemsForLessons(upcoming, instructorNames),
    ...plannerItemsForAppointments(
      appointments.filter((appointment) => appointment.status === "planned"),
    ),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const selectedKey = dayKey(selectedDate);
  const today = new Date();
  const monthDates = monthGrid(selectedDate);
  const monthLabel = monthTitleFmt.format(selectedDate);
  const selectedItems = plannerItems.filter(
    (item) => dayKey(new Date(item.startsAt)) === selectedKey,
  );

  const tabs = [
    { key: "lessons", label: "Lessen", href: "/student/lessons?tab=lessons", count: upcoming.length },
    {
      key: "exams",
      label: "Examens",
      href: "/student/lessons?tab=exams",
      count: examAppointments.length,
    },
    {
      key: "planning",
      label: "Planning",
      href: `/student/lessons?tab=planning&date=${selectedKey}`,
    },
  ] satisfies Array<{ key: LessonsTab; label: string; href: string; count?: number }>;

  return (
    <PWAPage app="student" contentClassName="space-y-3.5">
      <PWAPageHeader
        eyebrow="Agenda"
        title="Lessen"
        subtitle="Je volgende rijlessen, examenmomenten en dagplanning in één compacte flow."
        icon={<CalendarDays className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseTabs items={tabs} activeKey={activeTab} />

      {activeTab === "lessons" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Komende lessen"
            eyebrow="Direct inzicht"
            info="Je eerstvolgende les staat bovenaan. Voor eerdere lessen open je eenvoudig het lesdetail vanuit de geschiedenis."
          >
            {upcoming.length === 0 ? (
              <PWAEmptyState message="Er staan nog geen lessen gepland. Open berichten om een nieuwe les met je rijschool af te stemmen." />
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 8).map((lesson) => {
                  const start = new Date(lesson.starts_at);
                  const end = new Date(lesson.ends_at);
                  const durationMin = Math.round(
                    (end.getTime() - start.getTime()) / 60000,
                  );
                  const instructor = instructorNames.get(lesson.instructor_id) ?? tenant.name;

                  return (
                    <StudentListRow
                      key={lesson.id}
                      href={`/student/lessons/${lesson.id}`}
                      title={`${timeFmt.format(start)} - ${timeFmt.format(end)}`}
                      subtitle={`${instructor} · ${lesson.location ?? "Locatie volgt"} · ${durationMin} min`}
                      meta={isSameAmsterdamDay(start, today) ? "Vandaag" : dateFmt.format(start)}
                      badge="Rijles"
                      badgeVariant="primary"
                      leading={
                        <StudentInitialBadge
                          label={timeFmt.format(start).slice(0, 2)}
                          tone="blue"
                        />
                      }
                    />
                  );
                })}
              </div>
            )}
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Eerdere lessen"
            eyebrow="Terugblik"
            info="Gebruik je lesgeschiedenis om feedback, aantekeningen en geoefende onderdelen snel terug te vinden."
          >
            {past.length === 0 ? (
              <PWAEmptyState message="Zodra je eerste les is afgerond verschijnt die hier." />
            ) : (
              <div className="space-y-2">
                {past.slice(0, 6).map((lesson) => {
                  const start = new Date(lesson.starts_at);
                  return (
                    <StudentListRow
                      key={lesson.id}
                      href={`/student/lessons/${lesson.id}`}
                      title={dateFmt.format(start)}
                      subtitle={
                        summarizeLessonFeedback(lesson.progress_summary) ??
                        lesson.location ??
                        "Bekijk je lesdetail"
                      }
                      meta={timeFmt.format(start)}
                      badge={lesson.progress_score != null ? `${lesson.progress_score}/10` : "Les"}
                      badgeVariant={lesson.progress_score != null ? "success" : "outline"}
                      leading={<StudentInitialBadge label="Les" />}
                    />
                  );
                })}
              </div>
            )}
          </StudentShowcaseCard>
        </div>
      ) : null}

      {activeTab === "exams" ? (
        <StudentShowcaseCard
          title="Examens & toetsen"
          eyebrow="CBR momenten"
          info="Tussentijdse toetsen en praktijkexamens blijven ook hier zichtbaar, zodat je planning en examendetail op elkaar aansluiten."
          actionLabel="Examendetail"
          actionHref="/student/cbr"
        >
          {examAppointments.length === 0 ? (
            <PWAEmptyState message="Er staat nog geen tussentijdse toets of praktijkexamen ingepland." />
          ) : (
            <div className="space-y-2">
              {examAppointments.map((appointment) => {
                const start = new Date(appointment.starts_at);
                const end = new Date(appointment.ends_at);
                const durationMin = Math.round(
                  (end.getTime() - start.getTime()) / 60000,
                );
                const badgeVariant =
                  appointment.status === "completed" ? "success" : "warning";
                return (
                  <StudentListRow
                    key={appointment.id}
                    href="/student/cbr"
                    title={APPOINTMENT_TYPE_SHORT[appointment.type]}
                    subtitle={`${appointment.location ?? "Locatie volgt"} · ${durationMin} min`}
                    meta={`${dateFmt.format(start)} · ${timeFmt.format(start)}`}
                    badge={appointment.status === "completed" ? "Afgerond" : "Bevestigd"}
                    badgeVariant={badgeVariant}
                    leading={
                      <StudentInitialBadge
                        label={
                          appointment.type === "exam"
                            ? "EX"
                            : appointment.type === "interim_test"
                              ? "TT"
                              : "AF"
                        }
                        tone={appointment.type === "exam" ? "orange" : "green"}
                      />
                    }
                  />
                );
              })}
            </div>
          )}
        </StudentShowcaseCard>
      ) : null}

      {activeTab === "planning" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Planning kalender"
            eyebrow="Deze maand"
            info="Kies een dag in de kalender om je persoonlijke studentagenda te bekijken."
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <a
                  href={`/student/lessons?tab=planning&date=${dayKey(
                    new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1, 12),
                  )}`}
                  className="inline-flex h-9 items-center rounded-full border border-white/10 px-3 text-sm text-white/58 transition hover:text-white"
                >
                  Vorige
                </a>
                <div className="text-sm font-semibold capitalize text-white">{monthLabel}</div>
                <a
                  href={`/student/lessons?tab=planning&date=${dayKey(
                    new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1, 12),
                  )}`}
                  className="inline-flex h-9 items-center rounded-full border border-white/10 px-3 text-sm text-white/58 transition hover:text-white"
                >
                  Volgende
                </a>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">
                {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthDates.map((date) => {
                  const key = dayKey(date);
                  const inMonth = date.getMonth() === selectedDate.getMonth();
                  const isToday = isSameAmsterdamDay(date, today);
                  const selected = key === selectedKey;
                  const dayItems = plannerItems.filter(
                    (item) => dayKey(new Date(item.startsAt)) === key,
                  );
                  return (
                    <a
                      key={key}
                      href={`/student/lessons?tab=planning&date=${key}`}
                      className={[
                        "rounded-[1rem] border px-1.5 py-2 text-center transition",
                        selected
                          ? "border-primary/40 bg-primary/16 text-white shadow-[0_12px_24px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
                          : "border-white/8 bg-white/[0.02] text-white/76 hover:border-white/14",
                        !inMonth ? "opacity-45" : "",
                      ].join(" ")}
                    >
                      <div className={isToday ? "font-bold text-primary" : "text-xs"}>{date.getDate()}</div>
                      <div className="mt-1 flex min-h-3 items-center justify-center gap-1">
                        {dayItems.slice(0, 3).map((item) => (
                          <span
                            key={item.id}
                            className={[
                              "h-1.5 w-1.5 rounded-full",
                              item.kind === "lesson" ? "bg-primary" : "bg-emerald-400",
                            ].join(" ")}
                          />
                        ))}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title={longDateFmt.format(selectedDate)}
            eyebrow="Dagoverzicht"
            info="Hier zie je alle lessen en CBR-afspraken voor de geselecteerde dag."
          >
            {selectedItems.length === 0 ? (
              <PWAEmptyState message="Geen afspraken op deze dag binnen je huidige planning." />
            ) : (
              <div className="space-y-2">
                {selectedItems.map((item) => (
                  <StudentListRow
                    key={item.id}
                    href={item.href}
                    title={`${timeFmt.format(new Date(item.startsAt))} - ${timeFmt.format(new Date(item.endsAt))}`}
                    subtitle={`${item.title} · ${item.location ?? item.subtitle}`}
                    meta={item.kind === "lesson" ? "Les" : "Afspraak"}
                    badge={item.badgeLabel}
                    badgeVariant={item.badgeVariant}
                    leading={
                      item.kind === "lesson" ? (
                        <StudentInitialBadge label="Les" tone="blue" />
                      ) : (
                        <StudentInitialBadge label="EX" tone="green" />
                      )
                    }
                  />
                ))}
              </div>
            )}
          </StudentShowcaseCard>

          <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/62">
            <div className="flex items-center gap-2 font-semibold text-white">
              <NotebookPen className="h-4 w-4 text-primary" aria-hidden />
              Nieuwe les afstemmen
            </div>
            <p className="mt-1 leading-6">
              Wil je een extra les of iets verschuiven? Open berichten en stuur direct een aanvraag naar je rijschool.
            </p>
          </div>
        </div>
      ) : null}

      <div className="px-1 pt-1 text-xs text-white/42">
        Tijden worden getoond in CET/CEST voor jouw studentomgeving.
      </div>
    </PWAPage>
  );
}
