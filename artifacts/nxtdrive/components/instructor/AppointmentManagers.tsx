import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, Trash2 } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTenantInstructors } from "@/lib/availability/service";
import { listBranches, type Branch } from "@/lib/branches/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  canManageAgendaRow,
  requireAgendaAccessContext,
  requireAgendaAppointmentAccess,
} from "@/lib/agenda/access";
import { rolesGrantPermission } from "@/lib/permissions";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createAppointment,
  deleteAppointment,
  setAppointmentResult,
  updateAppointment,
} from "@/lib/agenda/actions";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_DURATIONS,
  APPOINTMENT_RESULT_LABEL,
  APPOINTMENT_TYPE_LABEL,
  appointmentBufferMinutes,
  appointmentDurationMinutes,
  isResultableType,
  isStudentLinkedType,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";
import { loadTenantPlanningSettings } from "@/lib/planning-settings/service";
import type { Student } from "@/lib/students/types";

type NewAppointmentSearchParams = {
  error?: string;
  type?: string;
  student_id?: string;
  instructor_id?: string;
  branch_id?: string;
  vehicle_id?: string;
  pickup_service_area_id?: string;
  date?: string;
  time?: string;
  duration_min?: string;
  title?: string;
  location?: string;
  notes?: string;
};

type ServiceArea = { id: string; name: string; branch_id: string | null };

function param(value: string | undefined, maxLength = 1000): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function appointmentType(value: string | undefined): AgendaAppointmentType | undefined {
  const raw = param(value, 80);
  return raw && (AGENDA_APPOINTMENT_TYPES as readonly string[]).includes(raw)
    ? (raw as AgendaAppointmentType)
    : undefined;
}

function dateParam(value: string | undefined): string | undefined {
  const raw = param(value, 10);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

function timeParam(value: string | undefined): string | undefined {
  const raw = param(value, 5);
  return raw && /^\d{2}:\d{2}$/.test(raw) ? raw : undefined;
}

function durationParam(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return (APPOINTMENT_DURATIONS as readonly number[]).includes(parsed)
    ? parsed
    : undefined;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

async function loadServiceAreas(input: {
  tenantId: string;
  branchFilterIds: readonly string[] | null;
}): Promise<ServiceArea[]> {
  const service = createServiceRoleClient();
  let query = service
    .from("service_areas")
    .select("id, name, branch_id")
    .eq("tenant_id", input.tenantId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (input.branchFilterIds) {
    query = query.or(
      `branch_id.is.null,branch_id.in.(${input.branchFilterIds.join(",")})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Rayons laden mislukt: ${error.message}`);
  }
  return (data ?? []) as ServiceArea[];
}

async function loadActiveStudents(input: {
  tenantId: string;
  branchFilterIds: readonly string[] | null;
}): Promise<Pick<Student, "id" | "full_name" | "branch_id">[]> {
  if (input.branchFilterIds && input.branchFilterIds.length === 0) return [];

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("students")
    .select("id, full_name, branch_id")
    .eq("tenant_id", input.tenantId)
    .eq("active", true)
    .order("full_name", { ascending: true });

  if (input.branchFilterIds) {
    query = query.in("branch_id", [...input.branchFilterIds]);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Leerlingen laden mislukt: ${error.message}`);
  }
  return (data ?? []) as Pick<Student, "id" | "full_name" | "branch_id">[];
}

function ManagerPage({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-w-0 space-y-4 xl:space-y-5">{children}</div>;
}

function ManagerHeader({
  eyebrow,
  title,
  subtitle,
  backHref,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-[1.65rem] font-black leading-tight text-foreground sm:text-2xl xl:text-[2.35rem]">
          {title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <Link href={backHref} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-brand-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Terug naar agenda
      </Link>
    </div>
  );
}

export async function InstructorNewAppointmentManager({
  searchParams,
  formPath,
  redirectTo,
}: {
  searchParams: Promise<NewAppointmentSearchParams>;
  formPath: string;
  redirectTo: string;
}) {
  const sp = await searchParams;
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const { user, organization: tenant, roles } = context;
  const planningSettings = await loadTenantPlanningSettings(service, tenant.id);
  const canSelectInstructor =
    !!user.profile?.is_platform_admin ||
    rolesGrantPermission(roles, "planning:manage");
  const branchFilterIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const instructors = canSelectInstructor
    ? await loadTenantInstructors(tenant.id, { branchIds: branchFilterIds })
    : undefined;

  const [allBranches, vehicles, serviceAreas, students] = await Promise.all([
    listBranches(service, tenant.id, { activeOnly: true }),
    loadVehicles(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
      activeOnly: true,
    }),
    loadServiceAreas({ tenantId: tenant.id, branchFilterIds }),
    loadActiveStudents({ tenantId: tenant.id, branchFilterIds }),
  ]);
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((branch) => branchScope.branch_ids.includes(branch.id))
      : allBranches;

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  const defaultBranchId =
    param(sp.branch_id, 80) && branches.some((branch) => branch.id === sp.branch_id)
      ? sp.branch_id
      : branches[0]?.id ?? null;
  const defaultInstructorId =
    param(sp.instructor_id, 80) && instructors?.some((instructor) => instructor.id === sp.instructor_id)
      ? sp.instructor_id
      : undefined;
  const defaultStudentId =
    param(sp.student_id, 80) && students.some((student) => student.id === sp.student_id)
      ? sp.student_id
      : undefined;
  const defaultVehicleId =
    param(sp.vehicle_id, 80) && vehicles.some((vehicle) => vehicle.id === sp.vehicle_id)
      ? sp.vehicle_id
      : undefined;
  const defaultServiceAreaId =
    param(sp.pickup_service_area_id, 80) &&
    serviceAreas.some((area) => area.id === sp.pickup_service_area_id)
      ? sp.pickup_service_area_id
      : undefined;

  return (
    <ManagerPage>
      <ManagerHeader
        eyebrow="Nieuwe planning"
        title="Nieuwe afspraak"
        subtitle="Plan een rijles, proefles, examenblok of administratieve afspraak met echte leerlingen, voertuigen en beschikbaarheidsvalidatie."
        backHref={redirectTo}
      />

      {sp.error ? (
        <div className="rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          Aanmaken mislukt: {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-brand-primary" aria-hidden />
              Afspraakgegevens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentForm
              action={createAppointment}
              mode="create"
              redirectTo={redirectTo}
              errorTo={formPath}
              branches={branches}
              instructors={instructors}
              ownInstructor={
                canSelectInstructor
                  ? undefined
                  : { id: user.id, full_name: user.profile?.full_name ?? "Jij" }
              }
              students={students}
              vehicles={vehicles}
              serviceAreas={serviceAreas}
              defaults={{
                type: appointmentType(sp.type),
                branchId: defaultBranchId,
                instructorId: defaultInstructorId,
                studentId: defaultStudentId,
                vehicleId: defaultVehicleId,
                pickupServiceAreaId: defaultServiceAreaId,
                date: dateParam(sp.date) ?? now.toISOString().slice(0, 10),
                time: timeParam(sp.time) ?? now.toISOString().slice(11, 16),
                durationMin: durationParam(sp.duration_min) ?? planningSettings.defaultLessonDurationMinutes,
                bufferMin: planningSettings.defaultLessonBufferMinutes,
                title: param(sp.title, 200) ?? null,
                location: param(sp.location, 200) ?? null,
                notes: param(sp.notes, 1000) ?? null,
              }}
              submitLabel="Afspraak inplannen"
            />
          </CardContent>
        </Card>

        <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
          <CardHeader>
            <CardTitle>Planningcheck</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <Badge variant="info">Echte planning-core</Badge>
            <p>
              Bij opslaan controleert het systeem de beschikbaarheid, voertuigbezetting, leerlingplanning en rayons voordat de afspraak wordt aangemaakt.
            </p>
            <p>
              Beschikbare voertuigen en leerlingen komen rechtstreeks uit deze tenant.
            </p>
          </CardContent>
        </Card>
      </div>
    </ManagerPage>
  );
}

export async function InstructorAppointmentDetailManager({
  appointmentId,
  formPath,
  redirectTo,
}: {
  appointmentId: string;
  formPath: string;
  redirectTo: string;
}) {
  const service = createServiceRoleClient();
  const {
    context,
    branchScope,
    appointment,
    appointmentBranchId,
  } = await requireAgendaAppointmentAccess(service, appointmentId, "read");
  if (!appointment) notFound();

  const { user, organization: tenant, roles } = context;
  const canSelectInstructor =
    !!user.profile?.is_platform_admin ||
    rolesGrantPermission(roles, "planning:manage");
  const canEditAppointment = canManageAgendaRow(context, branchScope, {
    branch_id: appointmentBranchId,
    instructor_id: appointment.instructor_id,
  });

  const instructors =
    canEditAppointment && canSelectInstructor
      ? await loadTenantInstructors(tenant.id)
      : undefined;
  const allBranches: Branch[] = canEditAppointment
    ? await listBranches(service, tenant.id, { activeOnly: true })
    : [];
  const vehicles = canEditAppointment
    ? await loadVehicles(service, tenant.id, {
        branchIds:
          branchScope.scope_type === "branches" ? branchScope.branch_ids : null,
        includeShared: true,
        activeOnly: true,
      })
    : [];
  const serviceAreas = canEditAppointment
    ? await loadServiceAreas({
        tenantId: tenant.id,
        branchFilterIds:
          branchScope.scope_type === "branches" ? branchScope.branch_ids : null,
      })
    : [];
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((branch) => branchScope.branch_ids.includes(branch.id))
      : allBranches;
  const students = canEditAppointment
    ? await loadActiveStudents({
        tenantId: tenant.id,
        branchFilterIds:
          branchScope.scope_type === "branches" ? branchScope.branch_ids : null,
      })
    : [];
  const linked = isStudentLinkedType(appointment.type);

  return (
    <ManagerPage>
      <ManagerHeader
        eyebrow="Afspraakdetail"
        title={appointment.title || APPOINTMENT_TYPE_LABEL[appointment.type]}
        subtitle={`${formatDateTime(appointment.starts_at)} - ${appointment.location ?? "Locatie volgt"}`}
        backHref={redirectTo}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {linked && appointment.student_id ? (
            <Link
              href={`/instructor/leerlingen/${appointment.student_id}`}
              className="inline-flex text-sm font-bold text-brand-primary hover:underline"
            >
              Open leerlingdossier
            </Link>
          ) : null}

          <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
            <CardHeader>
              <CardTitle>Afspraak bewerken</CardTitle>
            </CardHeader>
            <CardContent>
              {canEditAppointment ? (
                <AppointmentForm
                  action={updateAppointment}
                  mode="edit"
                  redirectTo={redirectTo}
                  errorTo={formPath}
                  appointmentId={appointment.id}
                  branches={branches}
                  instructors={instructors}
                  ownInstructor={
                    canSelectInstructor
                      ? undefined
                      : { id: user.id, full_name: user.profile?.full_name ?? "Jij" }
                  }
                  students={students}
                  vehicles={vehicles}
                  serviceAreas={serviceAreas}
                  defaults={{
                    type: appointment.type,
                    branchId: appointment.branch_id ?? appointmentBranchId,
                    instructorId: appointment.instructor_id,
                    vehicleId: appointment.vehicle_id,
                    pickupServiceAreaId: appointment.pickup_service_area_id,
                    studentId: appointment.student_id,
                    date: appointment.starts_at.slice(0, 10),
                    time: appointment.starts_at.slice(11, 16),
                    durationMin: appointmentDurationMinutes(appointment),
                    bufferMin: appointmentBufferMinutes(appointment),
                    title: appointment.title,
                    location: appointment.location,
                    notes: appointment.notes,
                  }}
                  submitLabel="Wijzigingen opslaan"
                />
              ) : (
                <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="font-bold text-foreground">Start</dt>
                    <dd>{formatDateTime(appointment.starts_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-foreground">Einde</dt>
                    <dd>{formatDateTime(appointment.ends_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-foreground">Locatie</dt>
                    <dd>{appointment.location ?? "Niet ingevuld"}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-foreground">Status</dt>
                    <dd>{appointment.status}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
            <CardHeader>
              <CardTitle>Samenvatting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Badge variant="primary">{APPOINTMENT_TYPE_LABEL[appointment.type]}</Badge>
              <div className="grid gap-2 text-muted-foreground">
                <span>{formatDateTime(appointment.starts_at)}</span>
                <span>{formatDateTime(appointment.ends_at)}</span>
                <span>{appointment.location ?? "Locatie volgt"}</span>
              </div>
            </CardContent>
          </Card>

          {isResultableType(appointment.type) ? (
            <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
              <CardHeader>
                <CardTitle>Uitslag</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {appointment.result ? (
                  <p className="rounded-2xl border border-brand-border bg-brand-muted/45 p-3 text-sm text-muted-foreground">
                    Vastgelegd:{" "}
                    <span className="font-black text-foreground">
                      {APPOINTMENT_RESULT_LABEL[appointment.result]}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nog geen uitslag vastgelegd.</p>
                )}
                {canEditAppointment ? (
                  <form action={setAppointmentResult} className="space-y-3">
                    <input type="hidden" name="appointment_id" value={appointment.id} />
                    <input type="hidden" name="redirect_to" value={formPath} />
                    <input type="hidden" name="error_to" value={formPath} />
                    <select
                      name="result"
                      defaultValue={appointment.result ?? ""}
                      required
                      className="w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm"
                    >
                      <option value="" disabled>
                        Kies resultaat...
                      </option>
                      <option value="passed">Geslaagd</option>
                      <option value="failed">Gezakt</option>
                    </select>
                    <textarea
                      name="result_note"
                      rows={3}
                      maxLength={1000}
                      defaultValue={appointment.result_note ?? ""}
                      placeholder="Vervolgadvies, optioneel"
                      className="w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm"
                    />
                    <Button type="submit">Uitslag opslaan</Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {canEditAppointment ? (
            <Card className="rounded-[1.35rem] border-destructive/30 bg-white/92 shadow-brand-card">
              <CardContent className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">
                  Verwijder deze afspraak definitief uit de agenda.
                </p>
                <form action={deleteAppointment}>
                  <input type="hidden" name="appointment_id" value={appointment.id} />
                  <input type="hidden" name="redirect_to" value={redirectTo} />
                  <Button type="submit" variant="danger">
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                    Verwijderen
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </ManagerPage>
  );
}
