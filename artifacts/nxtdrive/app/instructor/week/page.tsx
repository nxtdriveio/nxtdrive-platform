import Link from "next/link";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
import { APPOINTMENT_TYPE_LABEL } from "@/lib/agenda/types";
import { listMembershipOrganizationTeamIds } from "@/lib/organization/teams";
import { cn } from "@/lib/utils";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import {
  InstructorAgendaWorkspace,
  type InstructorAgendaEvent,
  type InstructorAgendaView,
} from "@/components/instructor/AgendaWorkspace";

export const dynamic = "force-dynamic";

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  return value;
}

function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonthGrid(date: Date) {
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return addDays(startOfMonthGrid(nextMonth), -1);
}

function parseView(raw: string | undefined): InstructorAgendaView {
  return raw === "day" || raw === "week" || raw === "month" ? raw : "week";
}

function parseDate(raw: string | undefined) {
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function visibleRange(view: InstructorAgendaView, anchor: Date) {
  if (view === "day") {
    const start = startOfDay(anchor);
    return { from: start, to: addDays(start, 1) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { from: start, to: addDays(start, 7) };
  }
  const start = startOfMonthGrid(anchor);
  return { from: start, to: addDays(endOfMonthGrid(anchor), 1) };
}

function mapLessons(
  lessons: Lesson[],
  studentNames: Map<string, string>,
): InstructorAgendaEvent[] {
  return lessons.map((lesson) => ({
    id: lesson.id,
    kind: "lesson",
    title: studentNames.get(lesson.student_id) ?? "Leerling",
    subtitle: lesson.location ?? "Leslocatie volgt",
    startsAt: lesson.starts_at,
    endsAt: lesson.ends_at,
    href: `/instructor/${lesson.id}`,
    location: lesson.location,
    notes: lesson.notes,
    badge: "Les",
    palette: "lesson",
    readOnly: false,
  }));
}

function mapTrials(trials: AgendaTrialLesson[]): InstructorAgendaEvent[] {
  return trials.map((trial) => ({
    id: trial.id,
    kind: "trial",
    title: trial.lead_name,
    subtitle: trial.pickup_location ?? "Proefleslocatie volgt",
    startsAt: trial.starts_at,
    endsAt: trial.ends_at,
    href: "/instructor/intake",
    location: trial.pickup_location,
    notes: trial.notes,
    badge: "Proefles",
    palette: "trial",
    readOnly: true,
  }));
}

function mapAppointments(appointments: AgendaAppointmentView[]): InstructorAgendaEvent[] {
  return appointments.map((appointment) => {
    const badge = appointment.student_name
      ? `Afspraak · ${appointment.student_name}`
      : appointment.team_name
        ? `${APPOINTMENT_TYPE_LABEL[appointment.type]} · ${appointment.team_name}`
        : APPOINTMENT_TYPE_LABEL[appointment.type];

    return {
      id: appointment.id,
      kind: "appointment",
      title:
        appointment.student_name ?? appointment.title?.trim() ?? "Agenda-item",
      subtitle: appointment.location ?? "Geen locatie",
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      href: `/instructor/afspraak/${appointment.id}`,
      location: appointment.location,
      notes: appointment.notes,
      badge,
      palette: appointment.type,
      colorOverride: appointment.color_override,
      readOnly: false,
      visibilityScope: appointment.visibility_scope,
      participantCount: appointment.participant_user_ids?.length ?? 0,
      teamName: appointment.team_name,
    };
  });
}

export default async function InstructorWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const params = await searchParams;
  const view = parseView(params.view);
  const anchor = parseDate(params.date);
  const { from, to } = visibleRange(view, anchor);

  const visibleStartHour = user.profile?.calendar_start_hour ?? 6;
  const visibleEndHour = user.profile?.calendar_end_hour ?? 22;

  const supabase = await createServerSupabaseClient();
  const activeMembership = user.memberships.find((membership) => membership.tenant_id === tenant.id) ?? null;
  const viewerTeamIds = activeMembership
    ? await listMembershipOrganizationTeamIds(supabase, tenant.id, activeMembership.id)
    : [];

  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at", { ascending: true });
  const lessons = (lessonsRaw ?? []) as Lesson[];

  const trials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from,
    to,
    instructorId: user.id,
  });

  const appointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from,
    to,
    viewerUserId: user.id,
    viewerTeamIds,
  });

  const studentIds = Array.from(
    new Set(lessons.map((lesson) => lesson.student_id).filter(Boolean)),
  );
  const { data: studentsRaw } = studentIds.length
    ? await supabase.from("students").select("id, full_name").in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map((student) => [
      student.id,
      student.full_name,
    ]),
  );

  const events = [
    ...mapLessons(lessons, studentNames),
    ...mapTrials(trials),
    ...mapAppointments(appointments),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  return (
    <PWAPage app="instructor" contentClassName="space-y-6">
      <PWAPageHeader
        eyebrow="Planning"
        title="Agenda"
        description="Schakel tussen dag, week en maand, sleep of resize afspraken naar een nieuw tijdslot en open ieder item vanuit een eigen instructeurflow."
        align="left"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/instructor"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Terug naar dashboard
            </Link>
            <Link
              href="/instructor/afspraak/nieuw"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Afspraak
            </Link>
            <Link
              href="/instructor/les/nieuw"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Les plannen
            </Link>
          </div>
        }
      />

      <InstructorAgendaWorkspace
        initialView={view}
        initialDate={anchor.toISOString().slice(0, 10)}
        events={events}
        visibleStartHour={visibleStartHour}
        visibleEndHour={visibleEndHour}
      />
    </PWAPage>
  );
}
