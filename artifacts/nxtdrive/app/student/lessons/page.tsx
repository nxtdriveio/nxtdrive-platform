import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
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
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Je account is nog niet gekoppeld aan een leerlingdossier.
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  // RLS guarantees each student sees only their own lessons; the order-by
  // index on (student_id, starts_at) keeps these queries cheap even without
  // pagination. We avoid silent hard limits so the page is true "full
  // history". If a student ever crosses ~500 lessons we'll add scroll-pager.
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
      <h1 className="text-2xl font-semibold text-foreground">Mijn planning</h1>
      <PlanningTabs
        upcoming={upcoming}
        past={past}
        instructorNames={instructorNames}
      />
    </div>
  );
}
