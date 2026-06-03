import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StudentCbrCard } from "@/components/student/StudentCbrCard";
import { StudentExamResultCard } from "@/components/student/StudentExamResultCard";
import { ExamPrepCard } from "@/components/student/ExamPrepCard";
import { getActiveStudent } from "@/lib/students/access";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import { loadStudentExamPrep } from "@/lib/exam/data";
import type { StudentBalance } from "@/lib/students/types";

export const dynamic = "force-dynamic";

export default async function StudentCbrPage() {
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
  const [cbrSummary, balanceRes] = await Promise.all([
    loadStudentCbrSummary(supabase, tenant.id, student.id),
    supabase
      .from("student_credit_balance")
      .select("student_id, balance")
      .eq("student_id", student.id)
      .maybeSingle(),
  ]);
  const balance = ((balanceRes.data as StudentBalance | null)?.balance ??
    0) as number;

  // Examenvoorbereiding: alleen laden zodra er een examen of tussentijdse toets
  // gepland staat (de afgeleide CBR-status is de bron).
  const examPrep =
    cbrSummary.derived.examStatus === "examen_gepland" ||
    cbrSummary.derived.examStatus === "toets_gepland"
      ? await loadStudentExamPrep(supabase, tenant.id, student.id)
      : null;

  return (
    <div className="space-y-4">
      <Link
        href="/student"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Terug naar home
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          CBR &amp; examens
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Je status richting het examen, je examenmoment en de voorbereiding.
        </p>
      </div>

      {cbrSummary.derived.lastExamResult ? (
        <StudentExamResultCard
          result={cbrSummary.derived.lastExamResult}
          examAt={cbrSummary.derived.lastExamAt}
          studentName={student.full_name}
          tenantName={tenant.name}
          lastExamNote={cbrSummary.lastExamNote}
          initialConsent={student.review_consent}
        />
      ) : null}

      <StudentCbrCard summary={cbrSummary} />

      {examPrep ? (
        <ExamPrepCard
          prep={examPrep}
          preconditions={cbrSummary.preconditions}
          balance={balance}
        />
      ) : null}
    </div>
  );
}
