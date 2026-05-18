import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentBalanceCard } from "@/components/student/BalanceCard";
import { getCurrentStudent } from "@/lib/students/current";
import {
  CREDIT_REASON_LABEL,
  type CreditLedgerRow,
  type StudentBalance,
} from "@/lib/students/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentCreditsPage() {
  const { user, tenant } = await requireActiveTenant(["student"]);
  const student = await getCurrentStudent(user.id, tenant.id);
  if (!student) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Je account is nog niet gekoppeld aan een leerlingdossier.
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [balanceRes, ledgerRes] = await Promise.all([
    supabase
      .from("student_credit_balance")
      .select("student_id, balance")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select("*")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const balance =
    ((balanceRes.data as StudentBalance | null)?.balance ?? 0) as number;
  const rows = (ledgerRes.data ?? []) as CreditLedgerRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Mijn tegoed</h1>

      <StudentBalanceCard balance={balance} />

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Recente mutaties
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen mutaties op je tegoed.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {rows.map((r) => {
                const positive = r.delta > 0;
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {CREDIT_REASON_LABEL[r.reason]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dateFmt.format(new Date(r.created_at))}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    </div>
                    <Badge variant={positive ? "success" : "warning"}>
                      {positive ? "+" : ""}
                      {r.delta}
                    </Badge>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
