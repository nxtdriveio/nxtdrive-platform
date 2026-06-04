import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTegoed, type Student, type StudentBalance } from "@/lib/students/types";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { listBranches } from "@/lib/branches/service";

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
  const { tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const supabase = await createServerSupabaseClient();

  const sp = searchParams ? await searchParams : {};
  const selectedBranchId =
    typeof sp.branch === "string" && sp.branch !== "" ? sp.branch : null;
  const isTenantAdmin = roles.includes("tenant_admin");

  const service = createServiceRoleClient();
  const branches = isTenantAdmin
    ? await listBranches(service, tenant.id, { activeOnly: true })
    : [];

  let studentsQuery = supabase
    .from("students")
    .select(
      "id, tenant_id, user_id, lead_id, full_name, email, phone, postcode, notes, active, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedBranchId) {
    studentsQuery = studentsQuery.eq("branch_id", selectedBranchId);
  }

  const { data: studentsRaw } = await studentsQuery;
  const students = (studentsRaw ?? []) as Student[];

  const { data: balancesRaw } = await supabase
    .from("student_credit_balance")
    .select("student_id, tenant_id, balance")
    .eq("tenant_id", tenant.id);
  const balances = (balancesRaw ?? []) as StudentBalance[];
  const balanceMap = new Map(balances.map((b) => [b.student_id, b.balance]));

  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name;

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
          {/* Branch filter — tenant_admin only */}
          {isTenantAdmin && branches.length > 0 ? (
            <form method="get" action="/backoffice/leerlingen">
              <select
                name="branch"
                defaultValue={selectedBranchId ?? ""}
                onChange={(e) => (e.target.form as HTMLFormElement)?.submit()}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Alle vestigingen</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
          {isTenantAdmin ? <AddStudentDialog /> : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        {students.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {selectedBranchId
              ? "Geen leerlingen gevonden voor deze vestiging."
              : "Nog geen leerlingen — converteer een lead of voeg er direct een toe."}
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
