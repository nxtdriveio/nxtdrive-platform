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

export default async function InstructorStudentsPage() {
  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const { data: lessonRows } = await supabase
    .from("lessons")
    .select("student_id, starts_at")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .order("starts_at", { ascending: true });

  const studentIdSet = new Set((lessonRows ?? []).map((r) => r.student_id as string));
  const studentIds = [...studentIdSet];

  const firstLessonMap = new Map<string, string>();
  for (const row of lessonRows ?? []) {
    const sid = row.student_id as string;
    if (!firstLessonMap.has(sid)) {
      firstLessonMap.set(sid, row.starts_at as string);
    }
  }

  const students: Student[] = [];
  if (studentIds.length > 0) {
    const { data: studentsRaw } = await supabase
      .from("students")
      .select(
        "id, tenant_id, user_id, lead_id, full_name, email, phone, postcode, notes, active, preferred_dayparts, refill_opt_in, refill_preferred_dayparts, review_consent, review_consent_at, review_consent_by, created_at, updated_at",
      )
      .eq("tenant_id", tenant.id)
      .in("id", studentIds)
      .order("full_name", { ascending: true });
    students.push(...((studentsRaw ?? []) as Student[]));
  }

  const balanceMap = new Map<string, number>();
  if (studentIds.length > 0) {
    const { data: balancesRaw } = await supabase
      .from("student_credit_balance")
      .select("student_id, tenant_id, balance")
      .eq("tenant_id", tenant.id)
      .in("student_id", studentIds);
    for (const b of (balancesRaw ?? []) as StudentBalance[]) {
      balanceMap.set(b.student_id, b.balance);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Mijn leerlingen
        </h1>
        <p className="text-sm text-muted-foreground">
          Leerlingen die aan jouw lessen zijn gekoppeld.
        </p>
      </div>

      <Card className="overflow-hidden">
        {students.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nog geen leerlingen gekoppeld aan jouw lessen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Postcode</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Eerste les</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => {
                const balance = balanceMap.get(s.id) ?? 0;
                const firstLesson = firstLessonMap.get(s.id);
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
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {s.postcode ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {firstLesson ? dateFmt.format(new Date(firstLesson)) : "—"}
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
