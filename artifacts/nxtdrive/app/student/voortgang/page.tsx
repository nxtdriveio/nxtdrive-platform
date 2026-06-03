import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StudentReadinessCard } from "@/components/skills/StudentReadinessCard";
import { StudentCategoryProgressCard } from "@/components/skills/StudentCategoryProgressCard";
import { StudentTrendCard } from "@/components/skills/StudentTrendCard";
import { RecentPracticeCard } from "@/components/skills/RecentPracticeCard";
import { getActiveStudent } from "@/lib/students/access";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadStudentLeskaart } from "@/lib/skills/student-leskaart-data";

export const dynamic = "force-dynamic";

export default async function StudentVoortgangPage() {
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
  const [readiness, leskaart] = await Promise.all([
    loadStudentReadiness(supabase, tenant.id, student.id),
    loadStudentLeskaart(supabase, tenant.id, student.id),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Mijn voortgang
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hoe je ervoor staat richting je examen — per onderdeel en in de tijd.
        </p>
      </div>

      <StudentReadinessCard readiness={readiness} />

      <StudentCategoryProgressCard categories={leskaart.categories} />

      {leskaart.recent ? <RecentPracticeCard recent={leskaart.recent} /> : null}

      <StudentTrendCard history={leskaart.history} />
    </div>
  );
}
