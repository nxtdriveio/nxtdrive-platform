import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PWAPage, PWAPageHeader, PWAEmptyState, PWACard } from "@/components/pwa/primitives";
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
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
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
    <PWAPage app="student">
      <PWAPageHeader
        title="Mijn voortgang"
        subtitle="Hoe je ervoor staat richting je examen, per onderdeel en in de tijd."
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
      />

      <StudentReadinessCard readiness={readiness} />

      {leskaart.categories.length >= 3 ? (
        <PWACard>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Vaardigheden in een oogopslag
          </div>
          <p className="mb-2 text-sm text-muted-foreground">
            Je gemiddelde score per onderdeel op de schaal 1-10.
          </p>
          <SkillRadar
            data={leskaart.categories.map((category) => ({
              label: category.label,
              value: category.averageScore,
            }))}
          />
        </PWACard>
      ) : null}

      <StudentCategoryProgressCard categories={leskaart.categories} />
      {leskaart.recent ? <RecentPracticeCard recent={leskaart.recent} /> : null}
      <StudentTrendCard history={leskaart.history} />
    </PWAPage>
  );
}
