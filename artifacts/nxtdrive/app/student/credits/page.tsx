import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentBalanceCard } from "@/components/student/BalanceCard";
import { getActiveStudent } from "@/lib/students/access";
import {
  CREDIT_REASON_LABEL,
  formatTegoedDelta,
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
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/student/select-child");
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
                const lessonHref =
                  r.related_type === "lesson" && r.related_id
                    ? `/student/lessons/${r.related_id}`
                    : null;
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {CREDIT_REASON_LABEL[r.reason]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dateFmt.format(new Date(r.created_at))}
                        {r.note ? ` · ${r.note}` : ""}
                        {lessonHref ? " · Bekijk les" : ""}
                      </div>
                    </div>
                    <Badge variant={positive ? "success" : "warning"}>
                      {formatTegoedDelta(r.delta)}
                    </Badge>
                    {lessonHref ? (
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </>
                );
                return (
                  <li key={r.id}>
                    {lessonHref ? (
                      <Link
                        href={lessonHref}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition hover:bg-muted/60"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        {inner}
                      </div>
                    )}
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
