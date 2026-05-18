import Link from "next/link";
import { CalendarDays, GraduationCap } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StudentLessonCard } from "@/components/student/LessonCard";
import { StudentBalanceCard } from "@/components/student/BalanceCard";
import { getCurrentStudent } from "@/lib/students/current";
import type { Lesson } from "@/lib/lessons/types";
import type { StudentBalance } from "@/lib/students/types";

export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function StudentHomePage() {
  const { user, tenant } = await requireActiveTenant(["student"]);
  const student = await getCurrentStudent(user.id, tenant.id);

  if (!student) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h1 className="text-xl font-semibold text-foreground">
            Welkom bij {tenant.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Je account is nog niet gekoppeld aan een leerlingdossier. Neem
            contact op met je rijschool om dit in orde te maken.
          </p>
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();
  const todayIso = startOfToday().toISOString();

  // Volgende les: eerste geplande les ≥ nu.
  const { data: nextRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", student.id)
    .eq("status", "planned")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextLesson = (nextRaw as Lesson | null) ?? null;

  // Komende week: alle aankomende lessen vanaf vandaag (max 5).
  const { data: upcomingRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", student.id)
    .gte("starts_at", todayIso)
    .order("starts_at", { ascending: true })
    .limit(5);
  const upcoming = ((upcomingRaw ?? []) as Lesson[]).filter(
    (l) => l.id !== nextLesson?.id,
  );

  const { data: balanceRow } = await supabase
    .from("student_credit_balance")
    .select("student_id, balance")
    .eq("student_id", student.id)
    .maybeSingle();
  const balance = ((balanceRow as StudentBalance | null)?.balance ?? 0) as number;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Hallo
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          {student.full_name.split(" ")[0]}
        </h1>
      </div>

      {nextLesson ? (
        <Card className="border-primary/40 bg-primary-soft/40">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Volgende les
            </div>
            <StudentLessonCard lesson={nextLesson} showDate />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Volgende les
            </div>
            <p className="text-sm text-muted-foreground">
              Er staat geen les gepland. Neem contact op met je rijschool om
              een les in te plannen.
            </p>
          </CardContent>
        </Card>
      )}

      <StudentBalanceCard balance={balance} />

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden />
              Komende lessen
            </div>
            <Link
              href="/student/lessons"
              className="text-xs text-primary hover:underline"
            >
              Alles bekijken
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen andere geplande lessen.
            </p>
          ) : (
            <ol className="space-y-2">
              {upcoming.map((l) => (
                <li key={l.id}>
                  <StudentLessonCard lesson={l} showDate />
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/student/lessons"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            Lessen overzicht
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
