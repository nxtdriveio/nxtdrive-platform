import Link from "next/link";
import { AlertTriangle, ChevronLeft, Clock, Sparkles } from "lucide-react";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import { rolesGrantPermission } from "@/lib/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { loadTenantInstructors } from "@/lib/availability/service";
import {
  LESSON_BUFFER_OPTIONS,
  LESSON_DURATION_OPTIONS,
  loadTenantPlanningSettings,
} from "@/lib/planning-settings/service";
import {
  createNlDateTimeFormatter,
  resolveTenantTimeZone,
  zonedYmd,
} from "@/lib/datetime";
import { formatTegoed, type Student, type StudentBalance } from "@/lib/students/types";
import { scheduleLesson } from "../actions";
import { LessonLocationField } from "./location-field";
import {
  generateSmartLessonSuggestions,
  type SmartLessonSlotSuggestion,
} from "@/lib/lesson-planning/smart-scheduling";
import type {
  PlanningActorAccess,
  PlanningScope,
} from "@/lib/planning-core";

export const dynamic = "force-dynamic";

type Instructor = { id: string; full_name: string | null };

type AgendaAccessContext = Awaited<ReturnType<typeof requireAgendaAccessContext>>;

function pagePlanningActor(
  context: AgendaAccessContext["context"],
  branchScope: AgendaAccessContext["branchScope"],
): PlanningActorAccess {
  const tenantId = context.organization.id;
  const canManageTenant =
    Boolean(context.user.profile?.is_platform_admin) ||
    context.roles.includes("tenant_admin") ||
    context.roles.includes("franchise_admin");
  return {
    userId: context.user.id,
    roles: context.roles,
    isPlatformAdmin: Boolean(context.user.profile?.is_platform_admin),
    tenantIds: canManageTenant ? [tenantId] : [],
    branchAccess: [
      {
        tenantId,
        branchIds:
          branchScope.scope_type === "all" ? "all" : branchScope.branch_ids,
      },
    ],
  };
}

function pagePlanningScope(
  tenantId: string,
  branchId: string | null | undefined,
): PlanningScope {
  return branchId
    ? { type: "branch", tenantId, branchId }
    : { type: "tenant", tenantId };
}

function tenantTimeInput(date: Date, timeZone: string): string {
  return createNlDateTimeFormatter(
    {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
    },
    timeZone,
  ).format(date);
}

export default async function NewLessonPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    student_id?: string;
    instructor_id?: string;
    date?: string;
    time?: string;
    duration_min?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const { user, organization: tenant, roles } = context;
  const timeZone = resolveTenantTimeZone(tenant);
  const planningSettings = await loadTenantPlanningSettings(service, tenant.id);
  const branchFilterIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const canSelectInstructor =
    !!user.profile?.is_platform_admin ||
    rolesGrantPermission(roles, "planning:manage");

  // Managers/planners may pick instructors inside their branch scope. A plain
  // instructor only schedules for themselves; the server action enforces this.
  const instructors: Instructor[] = canSelectInstructor
    ? await loadTenantInstructors(tenant.id, { branchIds: branchFilterIds })
    : [{ id: user.id, full_name: user.profile?.full_name ?? "Jij" }];

  // Students with balance for selection, constrained to the caller's branch scope.
  let students: Pick<Student, "id" | "tenant_id" | "branch_id" | "full_name">[] = [];
  if (!branchFilterIds || branchFilterIds.length > 0) {
    let studentsQuery = supabase
      .from("students")
      .select("id, tenant_id, branch_id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("full_name", { ascending: true });
    if (branchFilterIds) {
      studentsQuery = studentsQuery.in("branch_id", branchFilterIds);
    }
    const { data: studentsRaw } = await studentsQuery;
    students = (studentsRaw ?? []) as Pick<
      Student,
      "id" | "tenant_id" | "branch_id" | "full_name"
    >[];
  }

  const studentIds = students.map((s) => s.id);
  const { data: balancesRaw } = studentIds.length
    ? await supabase
        .from("student_credit_balance")
        .select("student_id, balance")
        .eq("tenant_id", tenant.id)
        .in("student_id", studentIds)
    : { data: [] };
  const balanceMap = new Map(
    ((balancesRaw ?? []) as StudentBalance[]).map((b) => [
      b.student_id,
      b.balance,
    ]),
  );

  const nextRoundHour = new Date(Date.now() + 60 * 60_000);
  nextRoundHour.setUTCMinutes(0, 0, 0);
  // Prefill from query params (e.g. the "stel leerling voor" flow), validated
  // before use; fall back to the next round hour.
  const prefillDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "")
    ? sp.date!
    : zonedYmd(nextRoundHour, timeZone);
  const prefillTime = /^\d{2}:\d{2}$/.test(sp.time ?? "")
    ? sp.time!
    : tenantTimeInput(nextRoundHour, timeZone);
  const defaultDate = prefillDate;
  const defaultTime = prefillTime;
  const prefillInstructorId =
    sp.instructor_id && instructors.some((i) => i.id === sp.instructor_id)
      ? sp.instructor_id
      : (instructors[0]?.id ?? "");
  const durationOptions = LESSON_DURATION_OPTIONS.map(String);
  const defaultDuration = durationOptions.includes(sp.duration_min ?? "")
    ? sp.duration_min!
    : String(planningSettings.defaultLessonDurationMinutes);
  const defaultBuffer = String(planningSettings.defaultLessonBufferMinutes);
  const prefillStudentId =
    sp.student_id && students.some((s) => s.id === sp.student_id)
      ? sp.student_id
      : (students[0]?.id ?? "");
  const selectedStudent = students.find((s) => s.id === prefillStudentId) ?? null;
  const smartDuration = Number.parseInt(defaultDuration, 10);
  const smartBuffer = Number.parseInt(defaultBuffer, 10);
  const smartSuggestions =
    selectedStudent && prefillInstructorId
      ? await generateSmartLessonSuggestions(service, {
          tenantId: tenant.id,
          studentId: selectedStudent.id,
          instructorId: prefillInstructorId,
          seedDate: defaultDate,
          seedTime: defaultTime,
          durationMin: smartDuration,
          bufferMin: smartBuffer,
          timeZone,
          actor: pagePlanningActor(context, branchScope),
          scope: pagePlanningScope(tenant.id, selectedStudent.branch_id),
          branchId: selectedStudent.branch_id,
          limit: 5,
        })
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/agenda"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar agenda
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Les plannen
        </h1>
        <p className="text-sm text-muted-foreground">
          Schrijft direct tegoed (uren) af op basis van de lesduur.
        </p>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Inplannen mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      {instructors.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Er zijn geen instructeurs binnen je huidige vestigingsscope.
        </Card>
      ) : students.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Geen leerlingen om in te plannen binnen je huidige vestigingsscope.{" "}
          <Link
            href="/backoffice/leads"
            className="text-primary hover:underline"
          >
            Converteer eerst een lead →
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe les</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={scheduleLesson} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="instructor_id">Instructeur</Label>
                  <Select
                    id="instructor_id"
                    name="instructor_id"
                    defaultValue={prefillInstructorId}
                    required
                  >
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name ?? "Instructeur"}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="student_id">Leerling</Label>
                  <Select
                    id="student_id"
                    name="student_id"
                    defaultValue={prefillStudentId}
                    required
                  >
                    {students.map((s) => {
                      const bal = balanceMap.get(s.id) ?? 0;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.full_name} — saldo: {formatTegoed(bal)}
                        </option>
                      );
                    })}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    required
                    defaultValue={defaultDate}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="time">Starttijd</Label>
                  <Input
                    id="time"
                    name="time"
                    type="time"
                    required
                    defaultValue={defaultTime}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="duration_min">Lestijd</Label>
                  <Select
                    id="duration_min"
                    name="duration_min"
                    defaultValue={defaultDuration}
                  >
                    {LESSON_DURATION_OPTIONS.map((duration) => (
                      <option key={duration} value={duration}>
                        {duration} min
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Het tegoed wordt automatisch met de lesduur verrekend.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="buffer_min">Buffer na afloop</Label>
                  <Select
                    id="buffer_min"
                    name="buffer_min"
                    defaultValue={defaultBuffer}
                  >
                    {LESSON_BUFFER_OPTIONS.map((buffer) => (
                      <option key={buffer} value={buffer}>
                        {buffer} min
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Agenda bezet: lestijd + buffer.
                  </p>
                </div>
              </div>

              <LessonLocationField />

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notities</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={1000}
                  placeholder="Optioneel"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Link
                  href="/backoffice/agenda"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Annuleren
                </Link>
                <Button type="submit">Les inplannen</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <SmartLessonSuggestionsPanel
          selectedStudentName={selectedStudent?.full_name ?? "Leerling"}
          studentId={prefillStudentId}
          instructorId={prefillInstructorId}
          durationMin={smartDuration}
          suggestions={smartSuggestions?.suggestions ?? []}
          blockingReasons={smartSuggestions?.blockingReasons ?? []}
          balanceMinutes={smartSuggestions?.balanceMinutes ?? 0}
        />
        </div>
      )}
    </div>
  );
}

function suggestionHref(args: {
  studentId: string;
  instructorId: string;
  suggestion: SmartLessonSlotSuggestion;
  durationMin: number;
}) {
  const params = new URLSearchParams({
    student_id: args.studentId,
    instructor_id: args.instructorId,
    date: args.suggestion.date,
    time: args.suggestion.time,
    duration_min: String(args.durationMin),
  });
  return `/backoffice/agenda/nieuw?${params.toString()}`;
}

function SmartLessonSuggestionsPanel({
  selectedStudentName,
  studentId,
  instructorId,
  durationMin,
  suggestions,
  blockingReasons,
  balanceMinutes,
}: {
  selectedStudentName: string;
  studentId: string;
  instructorId: string;
  durationMin: number;
  suggestions: SmartLessonSlotSuggestion[];
  blockingReasons: string[];
  balanceMinutes: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Slimme suggesties
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Beste lesmomenten voor {selectedStudentName}. Alleen momenten die door
          de planning-core komen worden voorgesteld.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={balanceMinutes >= durationMin ? "success" : "warning"}>
            Saldo {formatTegoed(balanceMinutes)}
          </Badge>
          <Badge variant="outline">{durationMin} min les</Badge>
        </div>

        {blockingReasons.length > 0 ? (
          <div className="rounded-lg border border-warning/30 bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              Geblokkeerde momenten
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {suggestions.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/35 p-4 text-sm text-muted-foreground">
            Geen slimme suggesties gevonden. Kies een andere instructeur, datum
            of controleer tegoed/beschikbaarheid.
          </div>
        ) : (
          <ul className="space-y-3">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.startsAt}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {suggestion.date} om {suggestion.time}
                      </span>
                      <Badge variant="primary">{suggestion.score} ptn</Badge>
                    </div>
                    {suggestion.reasons.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {suggestion.reasons.join(" · ")}
                      </p>
                    ) : null}
                    {suggestion.warnings.length > 0 ? (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{suggestion.warnings.join(" · ")}</span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        Geen zachte waarschuwingen
                      </div>
                    )}
                  </div>
                  <Link
                    href={suggestionHref({
                      studentId,
                      instructorId,
                      suggestion,
                      durationMin,
                    })}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    Gebruik
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
