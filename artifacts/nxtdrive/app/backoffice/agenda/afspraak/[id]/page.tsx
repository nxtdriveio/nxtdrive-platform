import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadTenantInstructors } from "@/lib/availability/service";
import { listBranches, type Branch } from "@/lib/branches/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import { rolesGrantPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { SlotStudentSuggestions } from "@/components/agenda/slot-student-suggestions";
import { ExamCandidateSuggestions } from "@/components/agenda/exam-candidate-suggestions";
import { ExamSignalsPanel } from "@/components/exam/exam-signals-panel";
import {
  canManageAgendaRow,
  requireAgendaAppointmentAccess,
} from "@/lib/agenda/access";
import { loadExamSignals } from "@/lib/exam/data";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  updateAppointment,
  deleteAppointment,
  setAppointmentResult,
} from "@/lib/agenda/actions";
import {
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_RESULT_LABEL,
  appointmentBufferMinutes,
  appointmentDurationMinutes,
  durationMinutes,
  isStudentLinkedType,
  isResultableType,
} from "@/lib/agenda/types";
import type { Student } from "@/lib/students/types";
import {
  createNlDateTimeFormatter,
  resolveTenantTimeZone,
  zonedYmd,
} from "@/lib/datetime";

export const dynamic = "force-dynamic";

function createAppointmentFormatters(timeZone: string) {
  return {
    dateTimeFmt: createNlDateTimeFormatter(
      {
        dateStyle: "full",
        timeStyle: "short",
      },
      timeZone,
    ),
    timeInputFmt: createNlDateTimeFormatter(
      {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
      },
      timeZone,
    ),
  };
}

export default async function EditAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const formPath = `/backoffice/agenda/afspraak/${id}`;

  const service = createServiceRoleClient();
  const {
    context,
    branchScope,
    appointment: appt,
    appointmentBranchId,
  } = await requireAgendaAppointmentAccess(service, id, "read");
  if (!appt) notFound();

  const { user, organization: tenant, roles } = context;
  const timeZone = resolveTenantTimeZone(tenant);
  const { dateTimeFmt, timeInputFmt } = createAppointmentFormatters(timeZone);
  const canSelectInstructor =
    !!user.profile?.is_platform_admin ||
    rolesGrantPermission(roles, "planning:manage");
  const canManageAppointment = canManageAgendaRow(context, branchScope, {
    branch_id: appointmentBranchId,
    instructor_id: appt.instructor_id,
  });
  const canEditAppointment = canManageAppointment;

  const supabase = await createServerSupabaseClient();
  const instructors =
    canEditAppointment && canSelectInstructor
      ? await loadTenantInstructors(tenant.id)
      : undefined;

  let serviceAreasQuery = service
    .from("service_areas")
    .select("id, name, branch_id")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("name", { ascending: true });
  if (branchScope.scope_type === "branches") {
    serviceAreasQuery = serviceAreasQuery.or(
      `branch_id.is.null,branch_id.in.(${branchScope.branch_ids.join(",")})`,
    );
  }

  const allBranches: Branch[] = canEditAppointment
    ? await listBranches(service, tenant.id)
    : [];
  const vehicles = canEditAppointment
    ? await loadVehicles(service, tenant.id, {
        branchIds:
          branchScope.scope_type === "branches" ? branchScope.branch_ids : null,
        includeShared: true,
        activeOnly: true,
      })
    : [];
  const serviceAreasRes = canEditAppointment
    ? await serviceAreasQuery
    : { data: [], error: null };
  if (serviceAreasRes.error) {
    throw new Error(`Rayons laden mislukt: ${serviceAreasRes.error.message}`);
  }
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;

  let students: Pick<Student, "id" | "full_name">[] = [];
  if (canEditAppointment) {
    const { data: studentsRaw } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("full_name", { ascending: true });
    students = (studentsRaw ?? []) as Pick<Student, "id" | "full_name">[];
  }

  const linked = isStudentLinkedType(appt.type);

  const examSignals = await loadExamSignals(service, tenant.id, appt.id);

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
          Afspraak bewerken
        </h1>
        <p className="text-sm text-muted-foreground">
          {APPOINTMENT_TYPE_LABEL[appt.type]}
        </p>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Bewerken mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      {linked && appt.student_id ? (
        <Link
          href={`/backoffice/leerlingen/${appt.student_id}`}
          className="inline-flex text-sm text-primary hover:underline"
        >
          Open leerlingdossier
        </Link>
      ) : null}

      {appt.type === "free_block" && canEditAppointment ? (
        <SlotStudentSuggestions
          tenantId={tenant.id}
          instructorId={appt.instructor_id}
          startsAt={appt.starts_at}
          durationMin={durationMinutes(appt.starts_at, appt.ends_at)}
          excludeAppointmentId={appt.id}
        />
      ) : null}

      {isResultableType(appt.type) &&
      appt.status === "planned" &&
      !appt.result &&
      canEditAppointment ? (
        <ExamCandidateSuggestions
          tenantId={tenant.id}
          appointmentId={appt.id}
          slotType={appt.type as "exam" | "interim_test"}
          startsAt={appt.starts_at}
          durationMin={durationMinutes(appt.starts_at, appt.ends_at)}
          excludeStudentId={appt.student_id}
        />
      ) : null}

      {examSignals ? (
        <ExamSignalsPanel
          appointmentId={appt.id}
          signals={examSignals.signals}
        />
      ) : null}

      {isResultableType(appt.type) ? (
        <Card>
          <CardHeader>
            <CardTitle>Uitslag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {appt.result ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Vastgelegd: </span>
                <span className="font-medium text-foreground">
                  {APPOINTMENT_RESULT_LABEL[appt.result]}
                </span>
                {appt.result_note ? (
                  <p className="mt-1 text-muted-foreground">
                    {appt.result_note}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nog geen uitslag vastgelegd.
              </p>
            )}
            {canEditAppointment ? (
              <form action={setAppointmentResult} className="space-y-3">
                <input type="hidden" name="appointment_id" value={appt.id} />
                <input type="hidden" name="redirect_to" value={formPath} />
                <input type="hidden" name="error_to" value={formPath} />
                <div className="space-y-1.5">
                  <label
                    htmlFor="result"
                    className="text-sm font-medium text-foreground"
                  >
                    Resultaat
                  </label>
                  <select
                    id="result"
                    name="result"
                    defaultValue={appt.result ?? ""}
                    required
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      Kies resultaat...
                    </option>
                    <option value="passed">Geslaagd</option>
                    <option value="failed">Gezakt</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="result_note"
                    className="text-sm font-medium text-foreground"
                  >
                    Vervolgadvies{" "}
                    <span className="text-muted-foreground">(optioneel)</span>
                  </label>
                  <textarea
                    id="result_note"
                    name="result_note"
                    rows={3}
                    maxLength={1000}
                    defaultValue={appt.result_note ?? ""}
                    placeholder="Bijv. extra aandacht voor invoegen voor herexamen."
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  />
                </div>
                <Button type="submit">Uitslag opslaan</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Gegevens</CardTitle>
        </CardHeader>
        <CardContent>
          {canEditAppointment ? (
            <AppointmentForm
              action={updateAppointment}
              mode="edit"
              redirectTo="/backoffice/agenda"
              errorTo={formPath}
              appointmentId={appt.id}
              branches={branches}
              instructors={instructors}
              ownInstructor={
                canSelectInstructor
                  ? undefined
                  : { id: user.id, full_name: user.profile?.full_name ?? "Jij" }
              }
              students={students}
              vehicles={vehicles}
              serviceAreas={serviceAreasRes.data ?? []}
              defaults={{
                type: appt.type,
                branchId: appt.branch_id ?? appointmentBranchId,
                instructorId: appt.instructor_id,
                vehicleId: appt.vehicle_id,
                pickupServiceAreaId: appt.pickup_service_area_id,
                studentId: appt.student_id,
                date: zonedYmd(new Date(appt.starts_at), timeZone),
                time: timeInputFmt.format(new Date(appt.starts_at)),
                durationMin: appointmentDurationMinutes(appt),
                bufferMin: appointmentBufferMinutes(appt),
                title: appt.title,
                location: appt.location,
                notes: appt.notes,
              }}
              submitLabel="Wijzigingen opslaan"
            />
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Je hebt leesrechten voor deze afspraak. Bewerken is
                uitgeschakeld totdat de afspraak binnen jouw beheerscope valt.
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Start</dt>
                  <dd>{dateTimeFmt.format(new Date(appt.starts_at))}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Einde</dt>
                  <dd>{dateTimeFmt.format(new Date(appt.ends_at))}</dd>
                </div>
                {appt.location ? (
                  <div>
                    <dt className="font-medium text-foreground">Locatie</dt>
                    <dd>{appt.location}</dd>
                  </div>
                ) : null}
                {appt.title ? (
                  <div>
                    <dt className="font-medium text-foreground">Titel</dt>
                    <dd>{appt.title}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          )}
        </CardContent>
      </Card>

      {canEditAppointment ? (
        <Card className="border-danger/30">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="text-sm text-muted-foreground">
              Verwijder deze afspraak definitief uit de agenda.
            </div>
            <form action={deleteAppointment}>
              <input type="hidden" name="appointment_id" value={appt.id} />
              <input
                type="hidden"
                name="redirect_to"
                value="/backoffice/agenda"
              />
              <Button type="submit" variant="danger">
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                Verwijderen
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
