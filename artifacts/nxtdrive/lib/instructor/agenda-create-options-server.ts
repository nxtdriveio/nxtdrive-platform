import "server-only";

import type { InstructorAgendaCreateOptions } from "@/domains/planning/application/instructor-agenda-create-options";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import { listBranches } from "@/lib/branches/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import { rolesGrantPermission } from "@/lib/permissions";
import { loadTenantPlanningSettings } from "@/lib/planning-settings/service";
import { createServiceRoleClient } from "@/lib/supabase/service";

type StudentRow = {
  id: string;
  full_name: string | null;
  branch_id: string | null;
};

type ServiceAreaRow = {
  id: string;
  name: string;
  branch_id: string | null;
};

export async function loadInstructorAgendaCreateOptions(): Promise<InstructorAgendaCreateOptions> {
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const tenantId = context.organization.id;
  const branchIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const canManagePlanning =
    Boolean(context.user.profile?.is_platform_admin) ||
    rolesGrantPermission(context.roles, "planning:manage");

  const accessibleStudentIds =
    !canManagePlanning && context.roles.includes("instructor")
      ? await import("@/lib/students/access").then((module) =>
          module.loadInstructorAccessibleStudentIds(
            service,
            tenantId,
            context.user.id,
          ),
        )
      : null;

  let studentQuery = service
    .from("students")
    .select("id, full_name, branch_id")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("full_name", { ascending: true });
  if (branchIds) studentQuery = studentQuery.in("branch_id", [...branchIds]);
  if (accessibleStudentIds) {
    if (accessibleStudentIds.length === 0) {
      studentQuery = studentQuery.in("id", [
        "00000000-0000-0000-0000-000000000000",
      ]);
    } else {
      studentQuery = studentQuery.in("id", accessibleStudentIds);
    }
  }

  let serviceAreaQuery = service
    .from("service_areas")
    .select("id, name, branch_id")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (branchIds) {
    serviceAreaQuery = serviceAreaQuery.or(
      `branch_id.is.null,branch_id.in.(${branchIds.join(",")})`,
    );
  }

  const [allBranches, vehicles, planningSettings, studentsResult, areasResult] =
    await Promise.all([
      listBranches(service, tenantId, { activeOnly: true }),
      loadVehicles(service, tenantId, {
        branchIds,
        includeShared: true,
        activeOnly: true,
      }),
      loadTenantPlanningSettings(service, tenantId),
      studentQuery,
      serviceAreaQuery,
    ]);
  if (studentsResult.error) {
    throw new Error(
      `Agenda-leerlingen laden mislukt: ${studentsResult.error.message}`,
    );
  }
  if (areasResult.error) {
    throw new Error(
      `Agenda-rayons laden mislukt: ${areasResult.error.message}`,
    );
  }

  const branches = branchIds
    ? allBranches.filter((branch) => branchIds.includes(branch.id))
    : allBranches;

  return {
    branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    ownInstructor: {
      id: context.user.id,
      full_name: context.user.profile?.full_name ?? "Jij",
    },
    students: ((studentsResult.data ?? []) as StudentRow[]).map((student) => ({
      id: student.id,
      full_name: student.full_name ?? "Leerling",
    })),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.label,
      license_plate: vehicle.license_plate,
      transmission: vehicle.transmission,
      status: vehicle.status,
      default_instructor_id: vehicle.default_instructor_id,
    })),
    serviceAreas: ((areasResult.data ?? []) as ServiceAreaRow[]).map(
      (area) => ({
        id: area.id,
        name: area.name,
        branch_id: area.branch_id,
      }),
    ),
    defaultLessonDurationMinutes: planningSettings.defaultLessonDurationMinutes,
    defaultLessonBufferMinutes: planningSettings.defaultLessonBufferMinutes,
  };
}
