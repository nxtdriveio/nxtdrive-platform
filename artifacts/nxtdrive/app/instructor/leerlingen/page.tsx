import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTegoed, type Student, type StudentBalance } from "@/lib/students/types";
import { PWAPage, PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function InstructorStudentsPage() {
  const { user, tenant } = await requireActiveTenant(["instructor"]);
  const supabase = await createServerSupabaseClient();

  const { data: lessonRows } = await supabase
    .from("lessons")
    .select("student_id, starts_at")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .order("starts_at", { ascending: true });

  const studentIds = Array.from(new Set((lessonRows ?? []).map((row) => row.student_id as string)));

  const firstLessonMap = new Map<string, string>();
  for (const row of lessonRows ?? []) {
    const studentId = row.student_id as string;
    if (!firstLessonMap.has(studentId)) {
      firstLessonMap.set(studentId, row.starts_at as string);
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

    for (const balance of (balancesRaw ?? []) as StudentBalance[]) {
      balanceMap.set(balance.student_id, balance.balance);
    }
  }

  return (
    <PWAPage app="instructor">
      <PWAPageHeader
        title="Mijn leerlingen"
        subtitle="Leerlingen die aan jouw lessen zijn gekoppeld, geoptimaliseerd voor een brede tabletweergave."
        align="wide"
      />

      {students.length === 0 ? (
        <PWAEmptyState message="Nog geen leerlingen gekoppeld aan jouw lessen." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Naam</th>
                  <th className="px-4 py-3 font-medium">Saldo</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Postcode</th>
                  <th className="px-4 py-3 font-medium">Eerste les</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((student) => {
                  const balance = balanceMap.get(student.id) ?? 0;
                  const firstLesson = firstLessonMap.get(student.id);

                  return (
                    <tr key={student.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link href={`/backoffice/leerlingen/${student.id}`} className="hover:underline">
                          {student.full_name}
                        </Link>
                      </td>
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
                        {firstLesson ? dateFmt.format(new Date(firstLesson)) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PWAPage>
  );
}
