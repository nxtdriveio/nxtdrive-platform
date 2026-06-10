import Link from "next/link";
import { ArrowRight, FileText, Sparkles, TrendingUp } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Lesson } from "@/lib/lessons/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  PWAEmptyState,
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function InstructorLessonEvaluationsPage() {
  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("id, student_id, starts_at, location, status, progress_score, progress_summary")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .in("status", ["completed", "in_progress"])
    .order("starts_at", { ascending: false })
    .limit(18);
  const lessons = (lessonsRaw ?? []) as Array<
    Pick<
      Lesson,
      "id" | "student_id" | "starts_at" | "location" | "status" | "progress_score" | "progress_summary"
    >
  >;

  const studentIds = Array.from(new Set(lessons.map((lesson) => lesson.student_id)));
  const { data: studentsRaw } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, full_name")
        .eq("tenant_id", tenant.id)
        .in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as Array<{ id: string; full_name: string }>).map((student) => [
      student.id,
      student.full_name,
    ]),
  );

  const withSummary = lessons.filter((lesson) => lesson.progress_summary?.trim());
  const averageScore = lessons.length > 0
    ? Math.round(
        lessons.reduce((sum, lesson) => sum + (lesson.progress_score ?? 0), 0) / lessons.length,
      )
    : 0;

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        eyebrow="Lesdossiers"
        title="Les evaluaties"
        description="Een compact overzicht van recente lesfeedback, voortgangsscores en context die je later op de dag nog wilt terugpakken."
        align="left"
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Recente evaluaties"
          value={withSummary.length}
          hint="Lessen met een opgeslagen voortgangssamenvatting."
          info="Hier zie je hoeveel recente lessen al concrete feedback of een samenvatting bevatten."
        />
        <PWAKpiTile
          label="Gemiddelde score"
          value={averageScore}
          hint="Gemiddelde voortgangsscore over je recente lessen."
          info="De gemiddelde progress score over de meest recente instructeurlessen in deze lijst."
        />
        <PWAKpiTile
          label="Direct open te zetten"
          value={lessons.length}
          hint="Lessen die je meteen kunt openen voor detail."
          info="Snelle toegang tot recente lescontext zonder eerst de hele agenda te openen."
        />
      </PWAKpiGrid>

      <PWACard
        title="Recente lesfeedback"
        className="bg-card"
        contentClassName="space-y-3"
        headerRight={<Sparkles className="h-4 w-4 text-primary" aria-hidden />}
      >
        {lessons.length === 0 ? (
          <PWAEmptyState
            icon={<FileText className="h-8 w-8" aria-hidden />}
            title="Nog geen les evaluaties"
            message="Zodra je lessen afrondt en samenvattingen opslaat, verschijnen ze hier in een rustig overzicht."
          />
        ) : (
          lessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/instructor/${lesson.id}`}
              className="flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-background/70 px-4 py-4 transition hover:border-primary/30 hover:bg-background md:flex-row md:items-start md:justify-between"
            >
              <div className="flex min-w-0 gap-3">
                <Avatar
                  name={studentNames.get(lesson.student_id) ?? "Leerling"}
                  className="h-11 w-11 text-xs"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {studentNames.get(lesson.student_id) ?? "Leerling"}
                    </p>
                    {lesson.progress_score !== null ? (
                      <Badge variant="primary">{lesson.progress_score}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {dateFmt.format(new Date(lesson.starts_at))}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {lesson.progress_summary?.trim() || "Deze les heeft nog geen opgeslagen voortgangssamenvatting."}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lesson.location ?? "Locatie volgt via de lescontext"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:pl-4">
                <Badge variant={lesson.progress_score && lesson.progress_score >= 7 ? "success" : "info"}>
                  {lesson.status === "completed" ? "Afgerond" : "Bezig"}
                </Badge>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </Link>
          ))
        )}
      </PWACard>

      <PWACard title="Waar let je vandaag extra op?" className="bg-card">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Consistente feedback
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Gebruik deze lijst om dezelfde feedbacklijnen vast te houden tussen opeenvolgende lessen.
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-primary" aria-hidden />
              Samenvattingen scherp houden
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Korte, concrete samenvattingen maken het voor jou en je leerling eenvoudiger om door te bouwen.
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              Direct terug de les in
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Vanuit iedere evaluatie spring je meteen terug naar de lesdetailpagina voor vervolgacties.
            </p>
          </div>
        </div>
      </PWACard>
    </PWAPage>
  );
}
