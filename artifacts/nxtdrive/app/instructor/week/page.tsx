import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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

const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

export default async function InstructorWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const sp = await searchParams;

  const anchor = sp.week ? new Date(sp.week) : new Date();
  const weekStart = startOfWeek(isNaN(anchor.getTime()) ? new Date() : anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(weekStart.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(weekStart.getDate() + 7);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .gte("starts_at", weekStart.toISOString())
    .lt("starts_at", weekEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (!roles.includes("tenant_admin")) {
    query = query.eq("instructor_id", user.id);
  }
  const { data: lessonsRaw } = await query;
  const lessons = (lessonsRaw ?? []) as Lesson[];

  const studentIds = Array.from(new Set(lessons.map((l) => l.student_id)));
  const { data: studentsRaw } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map((s) => [
      s.id,
      s.full_name,
    ]),
  );

  const days: { date: Date; lessons: Lesson[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push({ date: d, lessons: [] });
  }
  for (const l of lessons) {
    const idx = Math.floor(
      (new Date(l.starts_at).getTime() - weekStart.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (idx >= 0 && idx < 7) days[idx]!.lessons.push(l);
  }

  return (
    <div className="space-y-4">
      <Link
        href="/instructor"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar vandaag
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Weekplanning
          </h1>
          <p className="text-sm text-muted-foreground">
            {dayFmt.format(weekStart)} — {dayFmt.format(
              new Date(weekEnd.getTime() - 1),
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/instructor/week?week=${prevWeek.toISOString()}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ← Vorige
          </Link>
          <Link
            href="/instructor/week"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Deze week
          </Link>
          <Link
            href={`/instructor/week?week=${nextWeek.toISOString()}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Volgende →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => (
          <Card key={day.date.toISOString()}>
            <CardContent className="space-y-2 pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dayFmt.format(day.date)}
              </div>
              {day.lessons.length === 0 ? (
                <div className="text-xs text-muted-foreground">—</div>
              ) : (
                <ul className="space-y-1.5">
                  {day.lessons.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/instructor/${l.id}`}
                        className="block rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:border-primary"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-foreground">
                            {timeFmt.format(new Date(l.starts_at))}
                          </span>
                          <Badge variant={LESSON_STATUS_VARIANT[l.status]}>
                            {LESSON_STATUS_LABEL[l.status]}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-muted-foreground">
                          {studentNames.get(l.student_id) ?? "Leerling"}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
