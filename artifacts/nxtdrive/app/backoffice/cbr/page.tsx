import Link from "next/link";

import { AdminList, AdminListRow, AdminMetricStrip, AdminPage, AdminPanel, AdminSectionHeader, AdminTable, AdminTableRow } from "@/components/backoffice/admin-primitives";
import { Badge } from "@/components/ui/badge";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  loadTenantCbrOverview,
  type CbrOverviewRow,
} from "@/lib/cbr/data";
import {
  CBR_EXAM_STATUS_LABEL,
  CBR_EXAM_STATUS_TONE,
  type CbrStatusTone,
} from "@/lib/cbr/derive";
import { MACHTIGING_STATUS_LABEL } from "@/lib/cbr/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TONE_VARIANT: Record<
  CbrStatusTone,
  "default" | "info" | "warning" | "success" | "danger"
> = {
  neutral: "default",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "danger",
};

function hasExamPreconditions(row: CbrOverviewRow): boolean {
  return (
    row.preconditions.theorieBehaald &&
    row.preconditions.machtigingGeregeld &&
    (!row.preconditions.gezondheidsverklaringVereist ||
      row.preconditions.gezondheidsverklaringGeregeld)
  );
}

function missingPreconditionLabels(row: CbrOverviewRow): string[] {
  const missing: string[] = [];
  if (!row.preconditions.theorieBehaald) missing.push("Theorie");
  if (!row.preconditions.machtigingGeregeld) missing.push("Machtiging");
  if (
    row.preconditions.gezondheidsverklaringVereist &&
    !row.preconditions.gezondheidsverklaringGeregeld
  ) {
    missing.push("Gezondheidsverklaring");
  }
  return missing;
}

export default async function CbrOverviewPage() {
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant } = context;
  const supabase = await createServerSupabaseClient();
  const branchScope = await loadOrganizationBranchScope(supabase, context);
  const rows = await loadTenantCbrOverview(supabase, tenant.id, new Date(), {
    branchScope,
  });

  const readyRows = rows.filter(
    (row) => hasExamPreconditions(row) && row.derived.examStatus !== "geslaagd",
  );
  const blockedRows = rows.filter(
    (row) => missingPreconditionLabels(row).length > 0,
  );
  const replanRows = rows.filter(
    (row) =>
      row.derived.examStatus === "gezakt" ||
      row.derived.examStatus === "niet_verschenen",
  );
  const upcomingRows = [...rows]
    .filter((row) => row.derived.nextAppointmentAt)
    .sort(
      (left, right) =>
        Date.parse(left.derived.nextAppointmentAt ?? "") -
        Date.parse(right.derived.nextAppointmentAt ?? ""),
    );
  const upcomingNext14Days = upcomingRows.filter((row) => {
    const at = row.derived.nextAppointmentAt;
    if (!at) return false;
    const diff = Date.parse(at) - Date.now();
    return diff >= 0 && diff <= 14 * 24 * 60 * 60 * 1000;
  });
  const attentionRows = [...blockedRows, ...replanRows].slice(0, 8);

  return (
    <AdminPage>
      <AdminSectionHeader
        title="CBR-status"
        description={`Machtiging, theorie, gezondheidsverklaring en examenritme voor ${tenant.name}.`}
        actions={
          <>
            <Link
              href="/backoffice/leerlingen"
              className="rounded-full border border-border bg-[var(--surface-1)] px-3 py-2 text-sm font-medium text-foreground hover:bg-[var(--admin-row-hover)]"
            >
              Leerlingen
            </Link>
            <Link
              href="/backoffice/agenda"
              className="rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Agenda openen
            </Link>
          </>
        }
      />

      <AdminMetricStrip
        items={[
          { label: "Examenklaar", value: readyRows.length },
          { label: "Blokkades", value: blockedRows.length },
          { label: "Binnen 14 dagen", value: upcomingNext14Days.length },
          { label: "Herplanning nodig", value: replanRows.length },
        ]}
      />

      <AdminPanel
        title="Directe opvolging"
        description="Alleen leerlingen waar administratie of planning eerst iets moet doen."
        contentClassName="p-0"
      >
        {attentionRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Geen acute CBR-blokkades.
          </div>
        ) : (
          <AdminList>
            {attentionRows.map((row) => {
              const missing = missingPreconditionLabels(row);
              const needsReplan =
                row.derived.examStatus === "gezakt" ||
                row.derived.examStatus === "niet_verschenen";
              return (
                <AdminListRow
                  key={row.studentId}
                  href={`/backoffice/leerlingen/${row.studentId}`}
                  title={row.fullName}
                  subtitle={
                    missing.length > 0
                      ? `Ontbreekt: ${missing.join(", ")}`
                      : "Laatste examenafspraak vraagt herplanning."
                  }
                  meta={
                    <Badge variant={needsReplan ? "danger" : "warning"}>
                      {needsReplan ? "Herplanning" : "Blokkade"}
                    </Badge>
                  }
                />
              );
            })}
          </AdminList>
        )}
      </AdminPanel>

      <AdminTable
        columns={[
          "Naam",
          "Examenstatus",
          "Machtiging",
          "Theorie",
          "Gezondheidsverklaring",
          "Laatste uitslag",
          "Eerstvolgende",
          "Actie",
        ]}
        empty={
          rows.length === 0
            ? "Nog geen actieve leerlingen binnen je toegestane vestigingen."
            : undefined
        }
      >
        {rows.map((row) => {
          const gv = row.preconditions.gezondheidsverklaringVereist
            ? row.preconditions.gezondheidsverklaringGeregeld
              ? "Geregeld"
              : "Open"
            : "N.v.t.";
          return (
            <AdminTableRow key={row.studentId}>
              <td className="px-4 py-3">
                <Link
                  href={`/backoffice/leerlingen/${row.studentId}`}
                  className="font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {row.fullName}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    TONE_VARIANT[CBR_EXAM_STATUS_TONE[row.derived.examStatus]]
                  }
                >
                  {CBR_EXAM_STATUS_LABEL[row.derived.examStatus]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    row.preconditions.machtigingStatus === "ontvangen"
                      ? "success"
                      : row.preconditions.machtigingStatus === "aangevraagd"
                        ? "warning"
                        : "default"
                  }
                >
                  {MACHTIGING_STATUS_LABEL[row.preconditions.machtigingStatus]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.preconditions.theorieBehaald ? "Behaald" : "Open"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{gv}</td>
              <td className="px-4 py-3">
                {row.derived.lastExamResult ? (
                  <Badge
                    variant={
                      row.derived.lastExamResult === "passed"
                        ? "success"
                        : "danger"
                    }
                  >
                    {row.derived.lastExamResult === "passed"
                      ? "Geslaagd"
                      : row.derived.lastExamResult === "failed"
                        ? "Gezakt"
                        : "Niet verschenen"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.derived.nextAppointmentAt
                  ? dateFmt.format(new Date(row.derived.nextAppointmentAt))
                  : "-"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/backoffice/leerlingen/${row.studentId}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Dossier
                </Link>
              </td>
            </AdminTableRow>
          );
        })}
      </AdminTable>
    </AdminPage>
  );
}
