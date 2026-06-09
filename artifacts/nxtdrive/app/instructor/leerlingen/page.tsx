import Link from "next/link";
import { ArrowRight, Mail, MapPin, Phone, Users } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  formatTegoed,
  type Student,
  type StudentBalance,
} from "@/lib/students/types";
import {
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
  PWAEmptyState,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function InstructorStudentsPage() {
  const { user, tenant } = await requireActiveTenant(["instructor"]);
  const supabase = await createServerSupabaseClient();
  const now = Date.now();

  const { data: lessonRows } = await supabase
    .from("lessons")
    .select("student_id, starts_at")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .order("starts_at", { ascending: true });

  const studentIds = Array.from(
    new Set((lessonRows ?? []).map((row) => row.student_id as string)),
  );

  const firstLessonMap = new Map<string, string>();
  const upcomingLessonMap = new Map<string, string>();
  const lessonCountMap = new Map<string, number>();
  for (const row of lessonRows ?? []) {
    const studentId = row.student_id as string;
    if (!firstLessonMap.has(studentId)) {
      firstLessonMap.set(studentId, row.starts_at as string);
    }
    lessonCountMap.set(studentId, (lessonCountMap.get(studentId) ?? 0) + 1);
    const startsAt = row.starts_at as string;
    if (
      !upcomingLessonMap.has(studentId) &&
      new Date(startsAt).getTime() >= now
    ) {
      upcomingLessonMap.set(studentId, startsAt);
    }
  }

  const students: Student[] = [];
  if (studentIds.length > 0) {
    const { data: studentsRaw } = await supabase
      .from("students")
      .select(
        "id, tenant_id, user_id, lead_id, full_name, email, phone, postcode, notes, active, preferred_dayparts, refill_opt_in, refill_preferred_dayparts, review_consent, review_consent_at, review_consent_by, created_at, updated_at",
      )
      .eq("tenant_id", tenant.id)
      .in("id", studentIds)
      .order("full_name", { ascending: true });
    students.push(...((studentsRaw ?? []) as Student[]));
  }

  const balanceMap = new Map<string, number>();
  if (studentIds.length > 0) {
    const { data: balancesRaw } = await supabase
      .from("student_credit_balance")
      .select("student_id, tenant_id, balance")
      .eq("tenant_id", tenant.id)
      .in("student_id", studentIds);

    for (const balance of (balancesRaw ?? []) as StudentBalance[]) {
      balanceMap.set(balance.student_id, balance.balance);
    }
  }

  const lowBalanceCount = Array.from(balanceMap.values()).filter(
    (balance) => balance <= 0,
  ).length;

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        title="Mijn leerlingen"
        subtitle="Leerlingen die aan jouw lessen zijn gekoppeld, geoptimaliseerd voor een brede tabletweergave."
        align="wide"
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Actieve leerlingen"
          value={students.length}
          hint="Leerlingen die al aan jouw lessen gekoppeld zijn."
        />
        <PWAKpiTile
          label="Laag tegoed"
          value={lowBalanceCount}
          hint="Leerlingen die qua saldo mogelijk aandacht nodig hebben."
        />
        <PWAKpiTile
          label="Geplande contacten"
          value={Array.from(upcomingLessonMap.values()).length}
          hint="Leerlingen met een volgende les vanaf nu."
        />
      </PWAKpiGrid>

      {students.length === 0 ? (
        <PWAEmptyState message="Nog geen leerlingen gekoppeld aan jouw lessen." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {students.map((student) => {
            const balance = balanceMap.get(student.id) ?? 0;
            const firstLesson = firstLessonMap.get(student.id);
            const upcomingLesson = upcomingLessonMap.get(student.id);
            const totalLessons = lessonCountMap.get(student.id) ?? 0;

            return (
              <PWACard
                key={student.id}
                title={<span className="truncate">{student.full_name}</span>}
                className="bg-card"
                headerRight={
                  <Badge
                    variant={
                      balance > 300 ? "success" : balance > 0 ? "warning" : "danger"
                    }
                  >
                    {formatTegoed(balance)}
                  </Badge>
                }
                contentClassName="space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Volgende les
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {upcomingLesson
                        ? dateFmt.format(new Date(upcomingLesson))
                        : "Nog niet ingepland"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Totale lessen
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {totalLessons}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{student.email ?? "-"}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{student.phone ?? "-"}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{student.postcode ?? "-"}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      Eerste les: {firstLesson ? dateFmt.format(new Date(firstLesson)) : "-"}
                    </span>
                  </p>
                </div>

                <Link
                  href={`/backoffice/leerlingen/${student.id}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/80"
                >
                  Open leerlingdossier
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </PWACard>
            );
          })}
        </div>
      )}
    </PWAPage>
  );
}
