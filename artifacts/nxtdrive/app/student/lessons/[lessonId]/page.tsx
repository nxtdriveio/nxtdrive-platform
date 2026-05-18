import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StudentProgressCard } from "@/components/student/ProgressCard";
import { getCurrentStudent } from "@/lib/students/current";
import type { Lesson } from "@/lib/lessons/types";

export const dynamic = "force-dynamic";

export default async function StudentLessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const { user, tenant } = await requireActiveTenant(["student"]);
  const student = await getCurrentStudent(user.id, tenant.id);
  if (!student) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: lessonRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (!lessonRaw) notFound();
  const lesson = lessonRaw as Lesson;

  return (
    <div className="space-y-4">
      <Link
        href="/student/lessons"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Terug naar lessen
      </Link>

      <StudentProgressCard lesson={lesson} />

      {lesson.progress_summary == null && lesson.status === "completed" ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Je instructeur heeft nog geen toelichting gedeeld voor deze les.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
