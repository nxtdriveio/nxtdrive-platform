import Link from "next/link";

import { AdminMetricStrip, AdminPage, AdminSectionHeader, AdminTable, AdminTableRow } from "@/components/backoffice/admin-primitives";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import { loadBackofficeInstructors } from "@/lib/instructors/backoffice";
import { loadOrganizationBranchScope } from "@/lib/organization/branch-scope";
import { requireActiveOrganization } from "@/lib/organization/context";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
] as const;

const dateTimeFmt = createNlDateTimeFormatter({
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function hoursLabel(minutes: number): string {
  if (minutes <= 0) return "0 uur";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} uur`;
  return `${hours}u ${rest}m`;
}

export default async function BackofficeInstructorsPage() {
  const context = await requireActiveOrganization([...VIEW_ROLES]);
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const instructors = await loadBackofficeInstructors(
    service,
    context.organization.id,
    branchScope,
  );

  const withAvailability = instructors.filter(
    (instructor) => instructor.weeklyAvailabilityMinutes > 0,
  ).length;
  const todayTotal = instructors.reduce(
    (sum, instructor) => sum + instructor.todayAppointments,
    0,
  );
  const studentTotal = instructors.reduce(
    (sum, instructor) => sum + instructor.activeStudents,
    0,
  );

  return (
    <AdminPage>
      <AdminSectionHeader
        title="Instructeurs"
        description="Operationele lijst van instructeurs, leerlingen, beschikbaarheid en agenda-acties."
        actions={
          <>
            <Link
              href="/backoffice/medewerkers"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Medewerker uitnodigen
            </Link>
            <Link
              href="/backoffice/beschikbaarheid"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Beschikbaarheid beheren
            </Link>
          </>
        }
      />

      <AdminMetricStrip
        items={[
          { label: "Instructeurs", value: instructors.length },
          { label: "Afspraken vandaag", value: todayTotal },
          { label: "Leerlingen", value: studentTotal },
          { label: "Beschikbaarheid ingericht", value: `${withAvailability}/${instructors.length}` },
        ]}
      />

      <AdminTable
        columns={[
          "Naam",
          "Vestiging",
          "Leerlingen",
          "Vandaag",
          "Beschikbaar",
          "Volgende afspraak",
          "Acties",
        ]}
        empty={
          instructors.length === 0
            ? "Nog geen instructeurs. Nodig eerst een medewerker uit met instructeursrol."
            : undefined
        }
      >
        {instructors.map((instructor) => (
          <AdminTableRow key={instructor.id}>
            <td className="px-4 py-3">
              <Link
                href={`/backoffice/instructeurs/${instructor.id}`}
                className="font-semibold text-foreground hover:text-primary hover:underline"
              >
                {instructor.name}
              </Link>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {instructor.email}
              </div>
            </td>
            <td className="px-4 py-3 text-muted-foreground">
              {instructor.branchNames.length > 0
                ? instructor.branchNames.slice(0, 2).join(", ")
                : "Alle vestigingen"}
              {instructor.branchNames.length > 2 ? " +" : ""}
            </td>
            <td className="px-4 py-3 tabular-nums text-foreground">
              {instructor.activeStudents}
            </td>
            <td className="px-4 py-3">
              <Badge variant={instructor.todayAppointments > 0 ? "primary" : "outline"}>
                {instructor.todayAppointments}
              </Badge>
            </td>
            <td className="px-4 py-3 text-muted-foreground">
              {hoursLabel(instructor.weeklyAvailabilityMinutes)}
            </td>
            <td className="px-4 py-3 text-muted-foreground">
              {instructor.nextAppointment ? (
                <>
                  <span className="font-medium text-foreground">
                    {instructor.nextAppointment.label}
                  </span>
                  <div className="text-xs">
                    {dateTimeFmt.format(
                      new Date(instructor.nextAppointment.startsAt),
                    )}
                  </div>
                </>
              ) : (
                "Geen afspraak"
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/backoffice/instructeurs/${instructor.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Detail
                </Link>
                <Link
                  href={`/backoffice/planning-board/instructors/${instructor.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Agenda
                </Link>
              </div>
            </td>
          </AdminTableRow>
        ))}
      </AdminTable>
    </AdminPage>
  );
}
