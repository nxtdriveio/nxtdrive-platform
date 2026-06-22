import Link from "next/link";
import { Plus } from "lucide-react";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { canAccessBranch, rolesGrantPermission } from "@/lib/permissions";
import type { MemberRole } from "@/lib/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BranchFilterChips,
  BranchScopeSummary,
  BranchScopedEmptyState,
  ReadOnlyScopeNotice,
} from "@/components/backoffice/branch-scope-ui";
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
import {
  addDaysYmd,
  createNlDateTimeFormatter,
  resolveTenantTimeZone,
  startOfZonedDayUtc,
  zonedWeekdayIndex,
  zonedYmd,
} from "@/lib/datetime";
import { TrialLessonCard } from "@/components/agenda/trial-lesson-card";
import { AppointmentCard } from "@/components/agenda/appointment-card";
import { AvailabilityBanner } from "@/components/agenda/availability-banner";
import {
  loadFreeSpaceForRange,
  loadTenantInstructors,
} from "@/lib/availability/service";
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

function createAgendaFormatters(timeZone: string) {
  return {
    dayFmt: createNlDateTimeFormatter(
      {
        weekday: "short",
        day: "2-digit",
        month: "short",
      },
      timeZone,
    ),
    timeFmt: createNlDateTimeFormatter(
      {
        hour: "2-digit",
        minute: "2-digit",
      },
      timeZone,
    ),
  };
}

function cleanYmdParam(value: string | undefined, timeZone: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return zonedYmd(parsed, timeZone);
  }
  return zonedYmd(new Date(), timeZone);
}

function startOfWeekYmd(ymd: string, timeZone: string): string {
  const weekday = zonedWeekdayIndex(startOfZonedDayUtc(ymd, timeZone), timeZone);
  return addDaysYmd(ymd, -weekday);
}

function agendaHref(week: string | null, branchId: string | null): string {
  const params = new URLSearchParams();
  if (week) params.set("week", week);
  if (branchId) params.set("branch", branchId);
  const qs = params.toString();
  return qs ? `/backoffice/agenda?${qs}` : "/backoffice/agenda";
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
  const timeZone = resolveTenantTimeZone(tenant);
  const { dayFmt, timeFmt } = createAgendaFormatters(timeZone);

  const anchorYmd = cleanYmdParam(sp.week, timeZone);
  const weekStartYmd = startOfWeekYmd(anchorYmd, timeZone);
  const weekEndYmd = addDaysYmd(weekStartYmd, 7);
  const weekStart = startOfZonedDayUtc(weekStartYmd, timeZone);
  const weekEnd = startOfZonedDayUtc(weekEndYmd, timeZone);
  const prevWeek = addDaysYmd(weekStartYmd, -7);
  const nextWeek = addDaysYmd(weekStartYmd, 7);

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
  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name;
  const canManagePlanning =
    context.user.profile?.is_platform_admin ||
    rolesGrantPermission(context.roles, "planning:manage");

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

  const appointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    branchIds: branchFilterIds ?? undefined,
  });

  // Background availability: union across visible instructors only.
  const availabilityInstructors = await loadTenantInstructors(tenant.id, {
    branchIds: branchFilterIds,
  });
  const freeSpace = await loadFreeSpaceForRange(supabase, {
    tenantId: tenant.id,
    from: weekStart,
    to: weekEnd,
    instructorIds: availabilityInstructors.map((i) => i.id),
    branchIds: branchFilterIds,
    timeZone,
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
  const dayIndexByYmd = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const ymd = addDaysYmd(weekStartYmd, i);
    const d = startOfZonedDayUtc(ymd, timeZone);
    dayIndexByYmd.set(ymd, i);
    days.push({ date: d, items: [] });
  }
  const dayIndex = (startsAt: string) =>
    dayIndexByYmd.get(zonedYmd(new Date(startsAt), timeZone)) ?? -1;
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
  const hasAgendaItems = days.some((day) => day.items.length > 0);

  const currentWeekBranchHref = (branchId: string) => agendaHref(weekStartYmd, branchId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            Week van {dayFmt.format(weekStart)} - {dayFmt.format(
              new Date(weekEnd.getTime() - 1),
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={agendaHref(prevWeek, selectedBranchId)}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ← Vorige
          </Link>
          <Link
            href={agendaHref(null, selectedBranchId)}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Deze week
          </Link>
          <Link
            href={agendaHref(nextWeek, selectedBranchId)}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Volgende →
          </Link>
          {canManagePlanning ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      <BranchScopeSummary
        scope={branchScope}
        selectedBranchName={selectedBranchName}
        branchCount={branches.length}
        sharedRowsLabel="Beschikbaarheid wordt berekend over zichtbare instructeurs."
      />
      <BranchFilterChips
        branches={branches}
        selectedBranchId={selectedBranchId}
        allHref={agendaHref(weekStartYmd, null)}
        hrefForBranch={currentWeekBranchHref}
      />
      {!canManagePlanning ? (
        <ReadOnlyScopeNotice description="Je kunt de agenda bekijken binnen je vestigingsscope, maar lessen en afspraken plannen is voorbehouden aan planners en beheerders." />
      ) : null}
      {!hasAgendaItems ? (
        <BranchScopedEmptyState
          title="Geen agenda-items deze week"
          description={
            selectedBranchName
              ? "Er zijn geen lessen, proeflessen of afspraken voor deze vestiging in de geselecteerde week."
              : "Er zijn geen lessen, proeflessen of afspraken binnen je toegestane vestigingen in de geselecteerde week."
          }
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((day) => (
          <Card key={day.date.toISOString()} className="p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {dayFmt.format(day.date)}
            </div>
            <AvailabilityBanner
              intervals={freeSpace.get(dateKey(day.date, timeZone)) ?? []}
            />
            {day.items.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
                Geen planning binnen deze scope.
              </div>
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
