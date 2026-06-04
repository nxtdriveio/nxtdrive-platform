import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import { SkillRadar } from "@/components/charts/SkillRadar";
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
        <CardContent className="pt-6">
          <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />
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
      <PWAPageHeader
        title="Mijn voortgang"
        subtitle="Hoe je ervoor staat richting je examen — per onderdeel en in de tijd."
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
      />

      <StudentReadinessCard readiness={readiness} />

      {leskaart.categories.length >= 3 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
              Vaardigheden in één oogopslag
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              Je gemiddelde score per onderdeel op de schaal 1–10.
            </p>
            <SkillRadar
              data={leskaart.categories.map((c) => ({
                label: c.label,
                value: c.averageScore,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <StudentCategoryProgressCard categories={leskaart.categories} />

      {leskaart.recent ? <RecentPracticeCard recent={leskaart.recent} /> : null}

      <StudentTrendCard history={leskaart.history} />
    </div>
  );
}
