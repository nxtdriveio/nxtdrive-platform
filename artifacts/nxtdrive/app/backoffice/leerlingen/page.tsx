import Link from "next/link";

import { AdminMetricStrip, AdminPage, AdminSectionHeader, AdminTable, AdminTableRow } from "@/components/backoffice/admin-primitives";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { StudentsBranchFilter } from "@/components/students/StudentsBranchFilter";
import { Badge } from "@/components/ui/badge";
import { listBranches } from "@/lib/branches/service";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import {
  formatTegoed,
  type Student,
  type StudentBalance,
} from "@/lib/students/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant, roles } = context;
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const sp = searchParams ? await searchParams : {};
  const selectedBranchId =
    typeof sp.branch === "string" && sp.branch !== "" ? sp.branch : null;
  const canCreateStudents =
    context.user.profile?.is_platform_admin || roles.includes("tenant_admin");

  const [branchScope, allBranches] = await Promise.all([
    loadOrganizationBranchScope(service, context),
    listBranches(service, tenant.id, { activeOnly: true }),
  ]);

  const branchOptions =
    branchScope.scope_type === "all"
      ? allBranches
      : allBranches.filter((branch) => branchScope.branch_ids.includes(branch.id));
  const selectedBranch = selectedBranchId
    ? branchOptions.find((branch) => branch.id === selectedBranchId) ?? null
    : null;
  const hasInvalidBranchFilter = Boolean(selectedBranchId && !selectedBranch);
  const effectiveBranchId = selectedBranch?.id ?? null;
  const canQueryStudents =
    !hasInvalidBranchFilter &&
    (branchScope.scope_type === "all" || branchScope.branch_ids.length > 0);

  let students: Student[] = [];
  if (canQueryStudents) {
    let studentsQuery = supabase
      .from("students")
      .select(
        "id, tenant_id, branch_id, user_id, lead_id, full_name, email, phone, postcode, notes, active, created_at, updated_at",
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (effectiveBranchId) {
      studentsQuery = studentsQuery.eq("branch_id", effectiveBranchId);
    } else if (branchScope.scope_type === "branches") {
      studentsQuery = studentsQuery.in("branch_id", branchScope.branch_ids);
    }

    const { data: studentsRaw } = await studentsQuery;
    students = (studentsRaw ?? []) as Student[];
  }

  let balances: StudentBalance[] = [];
  if (students.length > 0) {
    const { data: balancesRaw } = await supabase
      .from("student_credit_balance")
      .select("student_id, tenant_id, balance")
      .eq("tenant_id", tenant.id)
      .in(
        "student_id",
        students.map((student) => student.id),
      );
    balances = (balancesRaw ?? []) as StudentBalance[];
  }

  const balanceMap = new Map(
    balances.map((balance) => [balance.student_id, balance.balance]),
  );
  const branchNameMap = new Map(allBranches.map((branch) => [branch.id, branch.name]));
  const activeStudents = students.filter((student) => student.active).length;
  const studentsWithBalance = students.filter(
    (student) => (balanceMap.get(student.id) ?? 0) > 0,
  ).length;
  const studentsNeedingRefill = students.filter(
    (student) => (balanceMap.get(student.id) ?? 0) <= 60,
  ).length;
  const emptyMessage = hasInvalidBranchFilter
    ? "Deze vestiging is niet beschikbaar binnen jouw toegang."
    : branchScope.scope_type === "branches" && branchOptions.length === 0
      ? "Je bent nog niet gekoppeld aan een vestiging met leerlingtoegang."
      : selectedBranchId
        ? "Geen leerlingen gevonden voor deze vestiging."
        : "Nog geen leerlingen. Converteer een lead of voeg er direct een toe.";

  return (
    <AdminPage>
      <AdminSectionHeader
        title="Leerlingen"
        description={`Leerlingdossiers van ${tenant.name}, compact weergegeven voor opvolging, planning en tegoed.`}
        actions={
          <>
            {branchOptions.length > 0 ? (
              <StudentsBranchFilter
                branchOptions={branchOptions}
                selectedBranchId={selectedBranchId}
              />
            ) : null}
            {canCreateStudents ? <AddStudentDialog /> : null}
          </>
        }
      />

      <AdminMetricStrip
        items={[
          { label: "Actieve dossiers", value: activeStudents },
          { label: "Met rijtegoed", value: studentsWithBalance },
          { label: "Opvolging nodig", value: studentsNeedingRefill },
          {
            label: "Vestigingenscope",
            value: branchScope.scope_type === "all" ? "Alle" : branchOptions.length,
          },
        ]}
      />

      <AdminTable
        columns={["Naam", "Vestiging", "Saldo", "Contact", "Postcode", "Sinds", "Acties"]}
        empty={students.length === 0 ? emptyMessage : undefined}
      >
        {students.map((student) => {
          const balance = balanceMap.get(student.id) ?? 0;
          const branchName = student.branch_id
            ? branchNameMap.get(student.branch_id) ?? "Vestiging onbekend"
            : "Niet gekoppeld";
          return (
            <AdminTableRow key={student.id}>
              <td className="px-4 py-3">
                <Link
                  href={`/backoffice/leerlingen/${student.id}`}
                  className="font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {student.full_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{branchName}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    balance > 300 ? "success" : balance > 0 ? "warning" : "danger"
                  }
                >
                  {formatTegoed(balance)}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {student.email ?? student.phone ?? "-"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {student.postcode ?? "-"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {dateFmt.format(new Date(student.created_at))}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/backoffice/leerlingen/${student.id}`}
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
