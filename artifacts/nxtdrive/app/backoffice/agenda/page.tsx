import Link from "next/link";
import { Plus } from "lucide-react";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { canAccessBranch } from "@/lib/permissions";
import type { MemberRole } from "@/lib/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { listBranches } from "@/lib/branches/service";

export const dynamic = "force-dynamic";

const AGENDA_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

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
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  return date;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; branch?: string }>;
}) {
  const context = await requireOrganizationPermission("planning:read", {
    allowedRoles: [...AGENDA_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant } = context;
  const sp = await searchParams;

  const anchor = sp.week ? new Date(sp.week) : new Date();
  const weekStart = startOfWeek(isNaN(anchor.getTime()) ? new Date() : anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(weekStart.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(weekStart.getDate() + 7);

  const requestedBranchId = sp.branch && sp.branch !== "" ? sp.branch : null;

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const selectedBranchId =
    requestedBranchId && canAccessBranch(branchScope, requestedBranchId)
      ? requestedBranchId
      : null;
  const branchFilterIds = selectedBranchId
    ? [selectedBranchId]
    : branchScope.scope_type === "branches"
      ? branchScope.branch_ids
      : null;

  const allBranches = await listBranches(service, tenant.id, { activeOnly: true });
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;

  let lessons: Lesson[] = [];
  if (!branchFilterIds || branchFilterIds.length > 0) {
    let lessonsQuery = supabase
      .from("lessons")
      .select("*")
      .eq("tenant_id", tenant.id)
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .order("starts_at", { ascending: true });

    if (branchFilterIds) {
      lessonsQuery = lessonsQuery.in("branch_id", branchFilterIds);
    }

    const { data: lessonsRaw } = await lessonsQuery;
    lessons = (lessonsRaw ?? []) as Lesson[];
  }

  const trials =
    branchFilterIds && branchFilterIds.length === 0
      ? []
      : await loadAgendaTrialLessons(supabase, {
          tenantId: tenant.id,
          from: weekStart,
          to: weekEnd,
          branchId: selectedBranchId ?? undefined,
          branchIds: selectedBranchId ? undefined : (branchFilterIds ?? undefined),
        });

  const visibleStudentsRaw = branchFilterIds
    ? branchFilterIds.length > 0
      ? await supabase
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", tenant.id)
          .in("branch_id", branchFilterIds)
      : { data: [] }
    : null;
  const visibleStudents = ((visibleStudentsRaw?.data ?? []) as Pick<
    Student,
    "id" | "full_name"
  >[]);
  const visibleStudentIds = branchFilterIds
    ? visibleStudents.map((s) => s.id)
    : undefined;

  const appointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    studentIds: visibleStudentIds,
  });

  // Background availability: union across all instructors ("someone is free").
  const freeSpace = await loadFreeSpaceForRange(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
  });

  // Pull display names for students (RLS-scoped to this tenant).
  const studentIds = Array.from(new Set(lessons.map((l) => l.student_id)));
  const { data: studentsRaw } = branchFilterIds
    ? { data: visibleStudents }
    : studentIds.length
      ? await supabase
          .from("students")
          .select("id, full_name")
          .in("id", studentIds)
      : { data: [] };
  const studentMap = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map((s) => [
      s.id,
      s.full_name,
    ]),
  );

  const instructorIds = Array.from(
    new Set([
      ...lessons.map((l) => l.instructor_id),
      ...trials.map((t) => t.instructor_id),
      ...appointments.map((a) => a.instructor_id),
    ]),
  );
  const { data: instructorsRaw } = instructorIds.length
    ? await service
        .from("profiles")
        .select("id, full_name")
        .in("id", instructorIds)
    : { data: [] };
  const instructorMap = new Map(
    ((instructorsRaw ?? []) as { id: string; full_name: string | null }[])
      .map((p) => [p.id, p.full_name ?? "Instructeur"]),
  );

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

  const branchParam = selectedBranchId ? `&branch=${selectedBranchId}` : "";
  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            Week van {dayFmt.format(weekStart)} — {dayFmt.format(
              new Date(weekEnd.getTime() - 1),
            )}
            {selectedBranchName ? (
              <span className="ml-2 text-primary font-medium">
                · {selectedBranchName}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch filter — limited to the caller's expanded branch scope. */}
          {branches.length > 1 ? (
            <form method="get" action="/backoffice/agenda">
              <input type="hidden" name="week" value={weekStart.toISOString()} />
              <select
                name="branch"
                defaultValue={selectedBranchId ?? ""}
                onChange={(e) => (e.target.form as HTMLFormElement)?.submit()}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Alle toegestane vestigingen</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </form>
          ) : null}

          <Link
            href={`/backoffice/agenda?week=${prevWeek.toISOString()}${branchParam}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ← Vorige
          </Link>
          <Link
            href={`/backoffice/agenda${selectedBranchId ? `?branch=${selectedBranchId}` : ""}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Deze week
          </Link>
          <Link
            href={`/backoffice/agenda?week=${nextWeek.toISOString()}${branchParam}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Volgende →
          </Link>
          <Link
            href="/backoffice/agenda/afspraak/nieuw"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Afspraak
          </Link>
          <Link
            href="/backoffice/agenda/nieuw"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Les plannen
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((day) => (
          <Card key={day.date.toISOString()} className="p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {dayFmt.format(day.date)}
            </div>
            <AvailabilityBanner
              intervals={freeSpace.get(dateKey(day.date)) ?? []}
            />
            {day.items.length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              <ul className="space-y-2">
                {day.items.map((item) =>
                  item.kind === "lesson" ? (
                    <li key={`lesson-${item.lesson.id}`}>
                      <Link
                        href={`/backoffice/agenda/${item.lesson.id}`}
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
                          {studentMap.get(item.lesson.student_id) ?? "Leerling"}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {instructorMap.get(item.lesson.instructor_id) ??
                            "Instructeur"}
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
                        instructorName={instructorMap.get(
                          item.trial.instructor_id,
                        )}
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
                        instructorName={instructorMap.get(
                          item.appointment.instructor_id,
                        )}
                        href={`/backoffice/agenda/afspraak/${item.appointment.id}`}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
