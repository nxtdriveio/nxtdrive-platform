import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StudentLessonCard } from "@/components/student/LessonCard";
import { getCurrentStudent } from "@/lib/students/current";
import { getInstructorNames } from "@/lib/students/instructor-names";
import type { Lesson } from "@/lib/lessons/types";

export const dynamic = "force-dynamic";

const monthFmt = new Intl.DateTimeFormat("nl-NL", {
  month: "long",
  year: "numeric",
});

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function StudentLessonsPage() {
  const { user, tenant } = await requireActiveTenant(["student"]);
  const student = await getCurrentStudent(user.id, tenant.id);
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
  const instructorNames = await getInstructorNames([
    ...upcoming.map((l) => l.instructor_id),
    ...past.map((l) => l.instructor_id),
  ]);

  // Groepeer historische lessen per maand.
  const pastByMonth = new Map<string, Lesson[]>();
  for (const l of past) {
    const key = monthKey(l.starts_at);
    const arr = pastByMonth.get(key) ?? [];
    arr.push(l);
    pastByMonth.set(key, arr);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-foreground">Mijn lessen</h1>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Geplande lessen
        </h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-foreground">
              Geen geplande lessen.
            </CardContent>
          </Card>
        ) : (
          <ol className="space-y-2">
            {upcoming.map((l) => (
              <li key={l.id}>
                <StudentLessonCard
                  lesson={l}
                  showDate
                  instructorName={instructorNames.get(l.instructor_id)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Eerdere lessen
          </h2>
          {Array.from(pastByMonth.entries()).map(([key, lessons]) => {
            const sample = lessons[0]!;
            return (
              <div key={key} className="space-y-2">
                <div className="text-xs font-medium capitalize text-muted-foreground">
                  {monthFmt.format(new Date(sample.starts_at))}
                </div>
                <ol className="space-y-2">
                  {lessons.map((l) => (
                    <li key={l.id}>
                      <StudentLessonCard
                        lesson={l}
                        showDate
                        instructorName={instructorNames.get(l.instructor_id)}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
