import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass, Route, Sparkles, TrendingUp } from "lucide-react";
import { ADVICE_LABELS, PHASE_LABELS } from "@workspace/leskaart";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  PWAEmptyState,
  PWAPage,
  PWAPageHeader,
  PWASectionHeader,
} from "@/components/pwa/primitives";
import { getActiveStudent } from "@/lib/students/access";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadStudentLeskaart } from "@/lib/skills/student-leskaart-data";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import { loadStudentRisProgress } from "@/lib/ris/data";
import { StudentRisProgressView } from "@/components/ris/StudentRisProgressView";
import {
  StudentChecklist,
  StudentListRow,
  StudentProgressBar,
  StudentRing,
  StudentShowcaseCard,
  StudentShowcaseTabs,
  StudentStars,
} from "@/components/student/Showcase";
import {
  buildStudentJourneySteps,
  roundedJourneyPct,
} from "@/lib/students/app-summary";
import { createNlDateTimeFormatter } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const historyDateFmt = createNlDateTimeFormatter({
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const historyTimeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

type ProgressTab = "roadmap" | "onderdelen" | "geschiedenis";
type RisProgressTab = "roadmap" | "modules" | "feedback";

function legacyProgressTabFrom(value: string | undefined): ProgressTab {
  return value === "onderdelen" || value === "geschiedenis" ? value : "roadmap";
}

function risProgressTabFrom(value: string | undefined): RisProgressTab {
  return value === "modules" || value === "feedback" ? value : "roadmap";
}

export default async function StudentVoortgangPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawTab = typeof params.tab === "string" ? params.tab : undefined;

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
  const risProgress = await loadStudentRisProgress(supabase, tenant.id, student.id);

  if (risProgress.settings.lessonCardMode === "ris") {
    return (
      <PWAPage app="student" contentClassName="space-y-3.5">
        <PWAPageHeader
          eyebrow="Mijn RIS-reis"
          title="Voortgang"
          subtitle="Bekijk je moduleprogressie, laatst geoefende scripts en de feedback die je instructeur met jou heeft gedeeld."
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
        />

        <StudentRisProgressView
          ris={risProgress}
          activeTab={risProgressTabFrom(rawTab)}
        />
      </PWAPage>
    );
  }

  const activeTab = legacyProgressTabFrom(rawTab);
  const [readiness, leskaart, cbrSummary, appointmentsRes] = await Promise.all([
    loadStudentReadiness(supabase, tenant.id, student.id),
    loadStudentLeskaart(supabase, tenant.id, student.id),
    loadStudentCbrSummary(supabase, tenant.id, student.id),
    supabase
      .from("agenda_appointments")
      .select("type, status, starts_at, result")
      .eq("tenant_id", tenant.id)
      .eq("student_id", student.id)
      .in("type", ["interim_test", "exam"])
      .order("starts_at", { ascending: true }),
  ]);

  if (appointmentsRes.error) {
    throw new Error(`Mijlpalen laden mislukt: ${appointmentsRes.error.message}`);
  }

  const milestoneAppointments = (appointmentsRes.data ?? []) as Array<{
    type: string;
    status: string;
    starts_at: string;
    result: string | null;
  }>;

  const completedLessonsCount =
    leskaart.history.filter((point) => point.status === "completed").length;
  const drivingTarget = Math.max(40, Math.ceil(Math.max(completedLessonsCount, 1) / 10) * 10);
  const journeyPct = roundedJourneyPct(
    leskaart.categories.map((category) => category.progressPct),
  );
  const journeySteps = buildStudentJourneySteps({
    theoryDone: cbrSummary.preconditions.theorieBehaald,
    completedLessonsCount,
    drivingTarget,
    hasCompletedTtt: milestoneAppointments.some(
      (appointment) => appointment.type === "interim_test" && appointment.status === "completed",
    ),
    hasPlannedTtt: milestoneAppointments.some(
      (appointment) => appointment.type === "interim_test" && appointment.status === "planned",
    ),
    hasCompletedExam: milestoneAppointments.some(
      (appointment) => appointment.type === "exam" && appointment.status === "completed",
    ),
    hasPlannedExam: milestoneAppointments.some(
      (appointment) => appointment.type === "exam" && appointment.status === "planned",
    ),
    passedExam: milestoneAppointments.some(
      (appointment) =>
        appointment.type === "exam" &&
        appointment.status === "completed" &&
        appointment.result === "passed",
    ),
  });

  const sortedCategories = [...leskaart.categories].sort(
    (left, right) =>
      right.criticalBelow - left.criticalBelow ||
      left.progressPct - right.progressPct ||
      left.label.localeCompare(right.label),
  );

  const weakest = sortedCategories.slice(0, 3);
  const totalHistory = [...leskaart.history].sort((left, right) =>
    right.startsAt.localeCompare(left.startsAt),
  );
  const lastLesson = totalHistory[0] ?? null;
  const blockers = readiness.blockers.slice(0, 3);

  const tabs = [
    { key: "roadmap", label: "Roadmap", href: "/student/voortgang?tab=roadmap" },
    {
      key: "onderdelen",
      label: "Vaardigheden",
      href: "/student/voortgang?tab=onderdelen",
      count: leskaart.categories.length,
    },
    {
      key: "geschiedenis",
      label: "Lesgeschiedenis",
      href: "/student/voortgang?tab=geschiedenis",
      count: totalHistory.length,
    },
  ] satisfies Array<{ key: ProgressTab; label: string; href: string; count?: number }>;

  return (
    <PWAPage app="student" contentClassName="space-y-3.5">
      <PWAPageHeader
        eyebrow="Mijn reis"
        title="Voortgang"
        subtitle="Bekijk je opbouw, waar je sterk staat en welke volgende stap nu het meeste oplevert."
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseTabs items={tabs} activeKey={activeTab} />

      {activeTab === "roadmap" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Mijn rijbewijsreis"
            eyebrow="Roadmap overzicht"
            info="Je totale voortgang is gebaseerd op je lesontwikkeling, theorie, CBR-status en afgeronde mijlpalen."
          >
            <div className="space-y-3 sm:grid sm:grid-cols-[7.4rem_minmax(0,1fr)] sm:gap-4 sm:space-y-0">
              <div className="flex items-center gap-3 sm:block">
                <StudentRing
                  value={journeyPct}
                  caption={`${completedLessonsCount} lessen afgerond`}
                />
                <div>
                  <div className="text-lg font-semibold text-white">
                    {journeyPct >= 70
                      ? "Je ligt goed op koers"
                      : journeyPct >= 40
                        ? "Je bouwt stabiel op"
                        : "Je reis is goed gestart"}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/58">
                    {ADVICE_LABELS[readiness.advice]} · {PHASE_LABELS[readiness.phase]}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <StudentChecklist
                  items={journeySteps.map((step) => ({
                    label: step.label,
                    checked: step.status === "complete",
                    detail:
                      step.status === "active"
                        ? step.value ?? "Nu in focus"
                        : step.status === "upcoming"
                          ? step.value ?? "Nog niet gestart"
                          : step.value ?? "Afgerond",
                  }))}
                />
              </div>
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Examengereedheid"
            eyebrow="Slimme inschatting"
            info="Deze indicatie gebruikt dezelfde readiness-engine als je instructeur, zodat jullie naar exact dezelfde voortgang kijken."
            actionLabel="CBR openen"
            actionHref="/student/cbr"
          >
            <div className="space-y-3 sm:grid sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4 sm:space-y-0">
              <div className="flex items-center gap-3 sm:block">
                <StudentRing
                  value={readiness.readinessPct}
                  size={102}
                  stroke={10}
                  label="Examen"
                />
                <div>
                  <div className="text-lg font-semibold text-white">
                    {ADVICE_LABELS[readiness.advice]}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/58">
                    {blockers[0] ?? "Je theorie, vaardigheden en CBR-mijlpalen bewegen samen richting examen."}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <StudentChecklist
                  items={[
                    {
                      label: "Theorie behaald",
                      checked: cbrSummary.preconditions.theorieBehaald,
                    },
                    {
                      label: "Machtiging geregeld",
                      checked: cbrSummary.preconditions.machtigingStatus === "ontvangen",
                    },
                    {
                      label: "Gezondheidsverklaring",
                      checked: !cbrSummary.preconditions.gezondheidsverklaringVereist ||
                        cbrSummary.preconditions.gezondheidsverklaringGeregeld,
                    },
                  ]}
                />
              </div>
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Focus voor nu"
            eyebrow="Waar groei oplevert"
            info="De onderdelen hieronder verdienen nu de meeste aandacht om je examenreadiness sneller te laten stijgen."
          >
            <div className="space-y-3">
              {weakest.map((category) => (
                <div
                  key={category.id}
                  className="rounded-[1.05rem] border border-white/10 bg-white/[0.02] px-3 py-2.75 sm:rounded-[1.1rem] sm:py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{category.label}</div>
                      <div className="mt-1 text-[11px] leading-[1.05rem] text-white/46 sm:text-xs sm:leading-5">
                        {category.criticalBelow > 0
                          ? `${category.criticalBelow} kritieke punten vragen aandacht`
                          : "Stabiel, maar nog te verdiepen"}
                      </div>
                    </div>
                    <StudentStars score={category.averageScore} />
                  </div>
                  <div className="mt-3">
                    <StudentProgressBar
                      label="Voortgang"
                      value={category.progressPct}
                      rightLabel={`${category.progressPct}%`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </StudentShowcaseCard>
        </div>
      ) : null}

      {activeTab === "onderdelen" ? (
        <StudentShowcaseCard
          title="Voortgang per onderdeel"
          eyebrow="Vaardigheden"
          info="Sterretjes geven je huidige niveau weer; de paarse balk laat zien hoeveel van het onderdeel al op niveau komt."
        >
          <div className="space-y-3">
            {sortedCategories.map((category) => (
              <div
                key={category.id}
                className="rounded-[1.05rem] border border-white/10 bg-white/[0.02] px-3 py-2.75 sm:rounded-[1.1rem] sm:py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{category.label}</div>
                    <div className="mt-1 text-[11px] leading-[1.05rem] text-white/46 sm:text-xs sm:leading-5">
                      {category.scoredLeaves} van {category.totalLeaves} onderdelen beoordeeld
                    </div>
                  </div>
                  <StudentStars score={category.averageScore} />
                </div>
                <div className="mt-3 space-y-3">
                  <StudentProgressBar
                    label="Voortgang"
                    value={category.progressPct}
                    rightLabel={`${category.progressPct}%`}
                  />
                  <div className="flex items-center justify-between gap-3 text-xs text-white/46">
                    <span>
                      {category.averageScore != null
                        ? `Gemiddeld ${category.averageScore.toFixed(1)} / 10`
                        : "Nog geen scores"}
                    </span>
                    <span>
                      {category.criticalBelow > 0
                        ? `${category.criticalBelow} kritisch`
                        : "Geen kritieke achterstand"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </StudentShowcaseCard>
      ) : null}

      {activeTab === "geschiedenis" ? (
        <StudentShowcaseCard
          title="Lesgeschiedenis"
          eyebrow="Recente lessen"
          info="Je ziet hier je recente lessen met score, samenvatting en directe toegang naar het volledige lesdetail."
        >
          {totalHistory.length === 0 ? (
            <PWAEmptyState message="Zodra je eerste beoordeelde les is afgerond verschijnt je lesgeschiedenis hier." />
          ) : (
            <div className="space-y-3">
              {lastLesson ? (
                <div className="rounded-[1.2rem] border border-primary/20 bg-primary/10 px-3.5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/68">
                        Laatste les
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {historyDateFmt.format(new Date(lastLesson.startsAt))}
                      </div>
                    </div>
                    <StudentRing
                      value={(lastLesson.progressScore ?? lastLesson.averageScore) * 10}
                      size={84}
                      stroke={9}
                      label="Lesniveau"
                    />
                  </div>
                  {lastLesson.summary ? (
                    <p className="mt-3 line-clamp-5 text-sm leading-6 text-white/62">
                      {lastLesson.summary}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                {totalHistory.map((point, index) => (
                  <StudentListRow
                    key={point.lessonId}
                    href={`/student/lessons/${point.lessonId}`}
                    title={`Les ${totalHistory.length - index}`}
                    subtitle={
                      point.summary ??
                      `${point.skillCount} onderdelen beoordeeld · ${point.averageScore.toFixed(1)} gemiddeld`
                    }
                    meta={`${historyDateFmt.format(new Date(point.startsAt))} · ${historyTimeFmt.format(new Date(point.startsAt))}`}
                    badge={point.progressScore != null ? `${point.progressScore}/10` : "Open"}
                    badgeVariant={point.progressScore != null ? "primary" : "outline"}
                    leading={
                      <div className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-primary/14 text-[0.68rem] font-semibold text-primary">
                        <span>{historyTimeFmt.format(new Date(point.startsAt)).slice(0, 2)}</span>
                        <span>{historyTimeFmt.format(new Date(point.startsAt)).slice(3, 5)}</span>
                      </div>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </StudentShowcaseCard>
      ) : null}

      <section className="px-1 pt-1">
        <PWASectionHeader icon={<Compass className="h-3.5 w-3.5" aria-hidden />}>
          Volgende slimme stap
        </PWASectionHeader>
        <Link
          href="/student/lessons"
          className="flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/72 transition hover:border-white/16 hover:text-white"
        >
          <span className="inline-flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" aria-hidden />
            Open je planning en houd je ritme vast
          </span>
          <Sparkles className="h-4 w-4 text-primary/72" aria-hidden />
        </Link>
      </section>
    </PWAPage>
  );
}
