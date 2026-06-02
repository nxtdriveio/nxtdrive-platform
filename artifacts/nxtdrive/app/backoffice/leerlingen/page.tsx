import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTegoed, type Student, type StudentBalance } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentsPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();

  const { data: studentsRaw } = await supabase
    .from("students")
    .select(
      "id, tenant_id, user_id, lead_id, full_name, email, phone, postcode, notes, active, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const students = (studentsRaw ?? []) as Student[];

  const { data: balancesRaw } = await supabase
    .from("student_credit_balance")
    .select("student_id, tenant_id, balance")
    .eq("tenant_id", tenant.id);
  const balances = (balancesRaw ?? []) as StudentBalance[];
  const balanceMap = new Map(balances.map((b) => [b.student_id, b.balance]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Leerlingen
        </h1>
        <p className="text-sm text-muted-foreground">
          Alle leerlingen van {tenant.name} met hun tegoed (uren).
        </p>
      </div>

      <Card className="overflow-hidden">
        {students.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nog geen leerlingen — converteer een lead om er een aan te maken.
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
