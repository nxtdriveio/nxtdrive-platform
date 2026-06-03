import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StudentTheoryHomeworkCard } from "@/components/student/TheoryHomeworkCard";
import { getActiveStudent } from "@/lib/students/access";
import { loadStudentTheoryHomework } from "@/lib/theory/data";

export const dynamic = "force-dynamic";

/**
 * Theorie-tab van de leerling-PWA (Task #177). Toont het theoriehuiswerk van de
 * leerling. MVP-scope: huiswerk + status; uitgebreide theorie-inhoud
 * (oefenonderwerpen, examendatum) volgt later (zie PWA Canon "Leerling
 * Theorie").
 */
export default async function StudentTheoriePage() {
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
  const homework = await loadStudentTheoryHomework(
    supabase,
    tenant.id,
    student.id,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <BookOpen className="h-6 w-6 text-primary" aria-hidden />
          Theorie
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Je theoriehuiswerk en wat je nog kunt oefenen voor je theorie-examen.
        </p>
      </div>

      <StudentTheoryHomeworkCard homework={homework} emptyHint />
    </div>
  );
}
