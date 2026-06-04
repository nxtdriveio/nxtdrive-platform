import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import { PlanningTabs } from "@/components/student/PlanningTabs";
import { getActiveStudent } from "@/lib/students/access";
import { getInstructorNames } from "@/lib/students/instructor-names";
import type { Lesson } from "@/lib/lessons/types";

export const dynamic = "force-dynamic";

export default async function StudentLessonsPage() {
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
  const nowIso = new Date().toISOString();

  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("student_id", student.id)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true }),
    supabase
      .from("lessons")
      .select("*")
      .eq("student_id", student.id)
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: false }),
  ]);
  const upcoming = (upcomingRes.data ?? []) as Lesson[];
  const past = (pastRes.data ?? []) as Lesson[];
  const namesMap = await getInstructorNames([
    ...upcoming.map((l) => l.instructor_id),
    ...past.map((l) => l.instructor_id),
  ]);
  const instructorNames = Object.fromEntries(namesMap);

  return (
    <div className="space-y-5">
      <PWAPageHeader
        title="Mijn planning"
        subtitle="Aankomende en afgeronde lessen in één overzicht."
        icon={<CalendarDays className="h-4 w-4" aria-hidden />}
      />
      <PlanningTabs
        upcoming={upcoming}
        past={past}
        instructorNames={instructorNames}
      />
    </div>
  );
}
