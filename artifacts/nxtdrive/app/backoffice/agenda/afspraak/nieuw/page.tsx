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
import { loadTenantPlanningSettings } from "@/lib/planning-settings/service";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const FORM_PATH = "/backoffice/agenda/afspraak/nieuw";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

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
              branchId: branches[0]?.id ?? null,
              date: now.toISOString().slice(0, 10),
              time: now.toISOString().slice(11, 16),
              durationMin: planningSettings.defaultLessonDurationMinutes,
              bufferMin: planningSettings.defaultLessonBufferMinutes,
            }}
            submitLabel="Afspraak inplannen"
          />
        </CardContent>
      </Card>
    </div>
  );
}
