import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PWAPage, PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import { StudentTheoryHomeworkCard } from "@/components/student/TheoryHomeworkCard";
import { getActiveStudent } from "@/lib/students/access";
import { loadStudentTheoryHomework } from "@/lib/theory/data";

export const dynamic = "force-dynamic";

export default async function StudentTheoriePage() {
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
  const homework = await loadStudentTheoryHomework(supabase, tenant.id, student.id);

  return (
    <PWAPage app="student">
      <PWAPageHeader
        title="Theorie"
        subtitle="Je theoriehuiswerk, voortgang en wat je nog kunt oefenen voor je theorie-examen."
        icon={<BookOpen className="h-4 w-4" aria-hidden />}
      />
      <StudentTheoryHomeworkCard homework={homework} emptyHint />
    </PWAPage>
  );
}
