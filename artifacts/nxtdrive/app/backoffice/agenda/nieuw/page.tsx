import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import { rolesGrantPermission } from "@/lib/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export const dynamic = "force-dynamic";

type Instructor = { id: string; full_name: string | null };

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
      )}
    </div>
  );
}
