import Link from "next/link";
import { ChevronLeft, CalendarX, ArrowRight } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function HerbezettenPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const nowIso = new Date().toISOString();

  // Freed blocks = cancelled lessons whose slot is still in the future, so the
  // planner can re-fill them. Most recently cancelled first.
  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .in("status", ["cancelled_with_refund", "cancelled_no_refund"])
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true });
  const lessons = (lessonsRaw ?? []) as Lesson[];

  const studentIds = Array.from(new Set(lessons.map((l) => l.student_id)));
  const { data: studentsRaw } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };
  const studentMap = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map((s) => [
      s.id,
      s.full_name,
    ]),
  );

  const instructorIds = Array.from(
    new Set(lessons.map((l) => l.instructor_id)),
  );
  const { data: instructorsRaw } = instructorIds.length
    ? await service
        .from("profiles")
        .select("id, full_name")
        .in("id", instructorIds)
    : { data: [] };
  const instructorMap = new Map(
    ((instructorsRaw ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name ?? "Instructeur"],
    ),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/agenda"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar agenda
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <CalendarX className="h-6 w-6 text-primary" aria-hidden />
          Herbezetten
        </h1>
        <p className="text-sm text-muted-foreground">
          Vrijgekomen momenten door annuleringen die nog in de toekomst liggen.
          Open een moment om passende leerlingen en leads voorgesteld te krijgen
          — adviserend, jij bevestigt zelf.
        </p>
      </div>

      {lessons.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Geen vrijgekomen momenten in de toekomst. Zodra een geplande les
            wordt geannuleerd verschijnt het hier.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lessons.map((l) => {
            const startsAt = new Date(l.starts_at);
            const endsAt = new Date(l.ends_at);
            const durationMin = Math.round(
              (endsAt.getTime() - startsAt.getTime()) / (1000 * 60),
            );
            return (
              <li key={l.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {dtFmt.format(startsAt)} – {timeFmt.format(endsAt)}
                        </span>
                        <Badge variant={LESSON_STATUS_VARIANT[l.status]}>
                          {LESSON_STATUS_LABEL[l.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {durationMin} min · {instructorMap.get(l.instructor_id)}{" "}
                        · vrijgekomen van{" "}
                        {studentMap.get(l.student_id) ?? "leerling"}
                      </p>
                      {l.cancellation_reason ? (
                        <p className="text-xs text-muted-foreground">
                          Reden: {l.cancellation_reason}
                        </p>
                      ) : null}
                    </div>
                    <Link
                      href={`/backoffice/agenda/${l.id}`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Herbezetten
                      <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                    </Link>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
