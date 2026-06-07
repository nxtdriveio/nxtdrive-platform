import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTegoed, type Student, type StudentBalance } from "@/lib/students/types";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { listBranches } from "@/lib/branches/service";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const STUDENT_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

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

  const balanceMap = new Map(balances.map((b) => [b.student_id, b.balance]));
  const selectedBranchName = selectedBranch?.name;
  const emptyMessage = hasInvalidBranchFilter
    ? "Deze vestiging is niet beschikbaar binnen jouw toegang."
    : branchScope.scope_type === "branches" && branchOptions.length === 0
      ? "Je bent nog niet gekoppeld aan een vestiging met leerlingtoegang."
      : selectedBranchId
        ? "Geen leerlingen gevonden voor deze vestiging."
        : "Nog geen leerlingen - converteer een lead of voeg er direct een toe.";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Leerlingen
          </h1>
          <p className="text-sm text-muted-foreground">
            Alle leerlingen van {tenant.name} met hun tegoed (uren).
            {selectedBranchName ? (
              <span className="ml-1 text-primary font-medium">
                · {selectedBranchName}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {branchOptions.length > 0 ? (
            <form method="get" action="/backoffice/leerlingen">
              <select
                name="branch"
                defaultValue={selectedBranchId ?? ""}
                onChange={(e) => (e.target.form as HTMLFormElement)?.submit()}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Alle toegestane vestigingen</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
          {canCreateStudents ? <AddStudentDialog /> : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        {students.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Postcode</th>
                <th className="px-4 py-3 font-medium">Sinds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => {
                const balance = balanceMap.get(s.id) ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        href={`/backoffice/leerlingen/${s.id}`}
                        className="hover:underline"
                      >
                        {s.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          balance > 300
                            ? "success"
                            : balance > 0
                              ? "warning"
                              : "danger"
                        }
                      >
                        {formatTegoed(balance)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.email ?? s.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.postcode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {dateFmt.format(new Date(s.created_at))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
