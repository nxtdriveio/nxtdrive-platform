import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTenantInstructors } from "@/lib/availability/service";
import { listBranches } from "@/lib/branches/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import {
  requireAgendaAccessContext,
  AGENDA_BACKOFFICE_MANAGE_ROLES,
} from "@/lib/agenda/access";
import { rolesGrantPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { createAppointment } from "@/lib/agenda/actions";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_DURATIONS,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";
import { loadTenantPlanningSettings } from "@/lib/planning-settings/service";
import type { Student } from "@/lib/students/types";
import {
  createNlDateTimeFormatter,
  resolveTenantTimeZone,
  zonedYmd,
} from "@/lib/datetime";

export const dynamic = "force-dynamic";

const FORM_PATH = "/backoffice/agenda/afspraak/nieuw";

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

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<NewAppointmentSearchParams>;
}) {
  const sp = await searchParams;
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const { user, organization: tenant, roles } = context;
  const timeZone = resolveTenantTimeZone(tenant);
  const planningSettings = await loadTenantPlanningSettings(service, tenant.id);
  const canSelectInstructor =
    !!user.profile?.is_platform_admin ||
    rolesGrantPermission(roles, "planning:manage");
  const branchFilterIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;

  const supabase = await createServerSupabaseClient();
  const instructors = canSelectInstructor
    ? await loadTenantInstructors(tenant.id, { branchIds: branchFilterIds })
    : undefined;

  let serviceAreasQuery = service
    .from("service_areas")
    .select("id, name, branch_id")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("name", { ascending: true });
  if (branchFilterIds) {
    serviceAreasQuery = serviceAreasQuery.or(
      `branch_id.is.null,branch_id.in.(${branchFilterIds.join(",")})`,
    );
  }

  const [allBranches, vehicles, serviceAreasRes] = await Promise.all([
    listBranches(service, tenant.id, { activeOnly: true }),
    loadVehicles(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
      activeOnly: true,
    }),
    serviceAreasQuery,
  ]);
  if (serviceAreasRes.error) {
    throw new Error(`Rayons laden mislukt: ${serviceAreasRes.error.message}`);
  }
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;

  let students: Pick<Student, "id" | "full_name" | "branch_id">[] = [];
  if (!branchFilterIds || branchFilterIds.length > 0) {
    let studentsQuery = supabase
      .from("students")
      .select("id, full_name, branch_id")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("full_name", { ascending: true });
    if (branchFilterIds) {
      studentsQuery = studentsQuery.in("branch_id", branchFilterIds);
    }
    const { data: studentsRaw } = await studentsQuery;
    students = (studentsRaw ?? []) as Pick<
      Student,
      "id" | "full_name" | "branch_id"
    >[];
  }

  const nextRoundHour = new Date(Date.now() + 60 * 60_000);
  nextRoundHour.setUTCMinutes(0, 0, 0);
  const defaultType = appointmentType(sp.type);
  const defaultBranchId =
    param(sp.branch_id, 80) && branches.some((branch) => branch.id === sp.branch_id)
      ? sp.branch_id
      : branches[0]?.id ?? null;
  const defaultInstructorId =
    param(sp.instructor_id, 80) && instructors?.some((i) => i.id === sp.instructor_id)
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
    (serviceAreasRes.data ?? []).some((area) => area.id === sp.pickup_service_area_id)
      ? sp.pickup_service_area_id
      : undefined;

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
          Nieuwe afspraak
        </h1>
        <p className="text-sm text-muted-foreground">
          Examen, tussentijdse toets, theoriebegeleiding of een blok dat tijd
          bezet (pauze, vrij blok, vakantie, ...).
        </p>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Aanmaken mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Afspraak inplannen</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentForm
            action={createAppointment}
            mode="create"
            redirectTo="/backoffice/agenda"
            errorTo={FORM_PATH}
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
              type: defaultType,
              branchId: defaultBranchId,
              instructorId: defaultInstructorId,
              studentId: defaultStudentId,
              vehicleId: defaultVehicleId,
              pickupServiceAreaId: defaultServiceAreaId,
              date: dateParam(sp.date) ?? zonedYmd(nextRoundHour, timeZone),
              time: timeParam(sp.time) ?? tenantTimeInput(nextRoundHour, timeZone),
              durationMin: durationParam(sp.duration_min),
              title: param(sp.title, 200) ?? null,
              location: param(sp.location, 200) ?? null,
              notes: param(sp.notes, 1000) ?? null,
            }}
            submitLabel="Afspraak inplannen"
          />
        </CardContent>
      </Card>
    </div>
  );
}
