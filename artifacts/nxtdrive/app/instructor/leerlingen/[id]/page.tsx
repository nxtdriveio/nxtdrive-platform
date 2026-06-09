import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronLeft, Phone } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireInstructorStudentAccess } from "@/lib/students/access";
import { loadStudentDossier } from "@/lib/students/dossier";
import type { Lesson } from "@/lib/lessons/types";
import {
  formatTegoed,
  type StudentBalance,
  type StudentCreditBreakdown,
} from "@/lib/students/types";
import { loadCockpitProgress, loadCockpitPayment } from "@/lib/instructor/cockpit-data";
import { CreditBreakdownCard } from "@/components/student/CreditBreakdownCard";
import { StudentStatusBar } from "@/components/students/StudentStatusBar";
import {
  CommunicationCard,
  CbrStatusCard,
  IntakeCard,
  LessonHistoryCard,
  PlannedCard,
  ReadinessCard,
  TasksCard,
  TheoryCard,
} from "@/components/students/StudentDossierCards";
import {
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";
import { InstructorStudentCard } from "@/components/instructor/StudentCard";
import { InstructorProgressCard } from "@/components/instructor/ProgressCard";
import { AiProgressAnalysis } from "@/components/instructor/AiProgressAnalysis";
import { openInstructorConversationAction } from "@/app/instructor/berichten/actions";

export const dynamic = "force-dynamic";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function InstructorStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceRoleClient();
  const supabase = await createServerSupabaseClient();
  const access = await requireInstructorStudentAccess(service, id);
  if (!access.student) notFound();

  const student = access.student;
  const dossier = await loadStudentDossier(supabase, service, {
    tenantId: access.tenantId,
    studentId: student.id,
    leadId: student.lead_id,
    email: student.email,
  });

  const { data: balanceRaw } = await supabase
    .from("student_credit_balance")
    .select("student_id, tenant_id, balance")
    .eq("student_id", student.id)
    .maybeSingle();
  const balance = ((balanceRaw as StudentBalance | null)?.balance ?? 0) as number;

  const { data: breakdownRaw } = await supabase
    .from("student_credit_breakdown")
    .select("*")
    .eq("student_id", student.id)
    .maybeSingle();
  const breakdown = breakdownRaw as StudentCreditBreakdown | null;

  const { data: upcomingRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", access.tenantId)
    .eq("student_id", student.id)
    .order("starts_at", { ascending: true });
  const lessons = (upcomingRaw ?? []) as Lesson[];
  const upcomingLessons = lessons.filter(
    (lesson) => new Date(lesson.starts_at).getTime() >= Date.now(),
  );
  const latestLesson = [...lessons].sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null;

  const [cockpitProgress, cockpitPayment] = await Promise.all([
    loadCockpitProgress(supabase, access.tenantId, student.id, balance),
    loadCockpitPayment(supabase, access.tenantId, student.id),
  ]);

  const nextLessonAt = upcomingLessons[0]?.starts_at ?? null;

  return (
    <PWAPage app="instructor" contentClassName="space-y-5 xl:space-y-6">
      <PWAPageHeader
        eyebrow="Leerlingcontext"
        title={student.full_name}
        description="Alles wat jij als instructeur direct nodig hebt rond deze leerling: planning, voortgang, theorie, communicatie en open aandachtspunten."
        align="left"
        actions={
          <Link
            href="/instructor/leerlingen"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Terug naar leerlingen
          </Link>
        }
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Beschikbaar tegoed"
          value={formatTegoed(balance)}
          hint={balance > 0 ? "Beschikbaar voor nieuwe lessen" : "Aanvullen of opvolgen nodig"}
          info="Het actuele leerlingtegoed dat nog gebruikt kan worden voor komende lessen."
        />
        <PWAKpiTile
          label="Open aandacht"
          value={dossier.tasks.length}
          hint="Taken of opvolgpunten rond deze leerling."
          info="Alle open taken die direct aan deze leerling gekoppeld zijn."
        />
        <PWAKpiTile
          label="Volgende les"
          value={nextLessonAt ? dtFmt.format(new Date(nextLessonAt)) : "Nog niet gepland"}
          hint={nextLessonAt ? "Eerstvolgende rit in planning" : "Nog geen vervolgles gepland"}
          info="De eerstvolgende geplande les voor deze leerling die nog in de toekomst ligt."
        />
      </PWAKpiGrid>

      <PWAKpiGrid compact className="lg:grid-cols-4">
        <PWAKpiTile
          label="Komende lessen"
          value={upcomingLessons.length}
          hint={upcomingLessons.length > 0 ? "Actieve ritten in de agenda" : "Nog geen nieuwe ritten"}
          info="Alle toekomstige lessen voor deze leerling die nu al gepland staan."
        />
        <PWAKpiTile
          label="Agenda-items"
          value={dossier.appointments.length}
          hint={dossier.appointments.length > 0 ? "Examens of blokken gekoppeld" : "Nog geen extra afspraken"}
          info="Niet-les agenda-items zoals examens, toetsen of andere geplande blokken."
        />
        <PWAKpiTile
          label="Laatste les"
          value={latestLesson ? dtFmt.format(new Date(latestLesson.starts_at)) : "Nog geen historie"}
          hint={latestLesson?.location ?? "Nog geen recente lescontext beschikbaar"}
          info="De meest recente les waarop je direct kunt terugvallen voor context of opvolging."
        />
        <PWAKpiTile
          label="Open facturen"
          value={dossier.invoices.filter((invoice) => invoice.status === "open").length}
          hint={dossier.outstandingCents > 0 ? "Financiele opvolging nodig" : "Geen openstaand bedrag"}
          info="Facturen die nog openstaan en mogelijk invloed hebben op vervolgplanning of pakketadvies."
        />
      </PWAKpiGrid>

      <StudentStatusBar
        studentId={student.id}
        nextLessonAt={nextLessonAt}
        balanceMinutes={balance}
        openInvoiceCount={dossier.invoices.filter((invoice) => invoice.status === "open").length}
        outstandingCents={dossier.outstandingCents}
        theoriePassed={dossier.cbrStatus ? dossier.cbrStatus.theorie_behaald : null}
        machtigingArranged={dossier.cbrStatus ? dossier.cbrStatus.machtiging_geregeld : null}
        healthRequired={dossier.cbrStatus ? dossier.cbrStatus.gezondheidsverklaring_vereist : true}
        healthArranged={dossier.cbrStatus ? dossier.cbrStatus.gezondheidsverklaring_geregeld : null}
        readiness={dossier.readiness}
        openTaskCount={dossier.tasks.length}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="space-y-5">
          <InstructorStudentCard
            student={{
              id: student.id,
              full_name: student.full_name,
              email: student.email,
              phone: student.phone,
              active: student.active,
            }}
          />

          {latestLesson ? (
            <InstructorProgressCard
              lesson={latestLesson}
              progressScore={latestLesson.progress_score ?? null}
              progress={cockpitProgress}
              payment={cockpitPayment}
            />
          ) : (
            <PWACard title="Voortgang" className="bg-card">
              Er is nog geen leshistorie voor deze leerling om voortgang of betaling uit af te leiden.
            </PWACard>
          )}

          <PlannedCard
            upcomingLessons={upcomingLessons}
            appointments={dossier.appointments}
            studentId={student.id}
            scope="instructor"
          />

          <LessonHistoryCard lessons={dossier.lessons} scope="instructor" />

          <TheoryCard homework={dossier.theory} />

          {breakdown ? <CreditBreakdownCard breakdown={breakdown} /> : null}
        </div>

        <div className="space-y-5">
          <PWACard title="Snelle acties" className="bg-card" contentClassName="space-y-3">
            {latestLesson ? (
              <Link
                href={`/instructor/${latestLesson.id}`}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-background px-3.5 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:shadow-sm"
              >
                Laatste les openen
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
            ) : null}
            <Link
              href={`/instructor/les/nieuw?student_id=${student.id}`}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-background px-3.5 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:shadow-sm"
            >
              Nieuwe les plannen
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
            {student.phone ? (
              <a
                href={`tel:${student.phone.replace(/\s+/g, "")}`}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-background px-3.5 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:shadow-sm"
              >
                Leerling bellen
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
              </a>
            ) : null}
            <form action={openInstructorConversationAction}>
              <input type="hidden" name="student_id" value={student.id} />
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background px-3.5 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:shadow-sm"
              >
                Bericht sturen
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </button>
            </form>
          </PWACard>

          <PWACard title="Planningcontext" className="bg-card" contentClassName="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Eerstvolgende rit
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {nextLessonAt ? dtFmt.format(new Date(nextLessonAt)) : "Nog niet gepland"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {upcomingLessons[0]?.location ?? "Plan een nieuwe les om meteen ritme vast te leggen."}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Laatste lescontext
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {latestLesson ? dtFmt.format(new Date(latestLesson.starts_at)) : "Nog geen leshistorie"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {latestLesson?.notes?.trim() || "Nog geen recente lesnotitie beschikbaar."}
                </p>
              </div>
            </div>
          </PWACard>

          <ReadinessCard readiness={dossier.readiness} />
          <CbrStatusCard status={dossier.cbrStatus} checklist={dossier.cbrChecklist} />
          <CommunicationCard communications={dossier.communications} />
          <TasksCard tasks={dossier.tasks} />
          <IntakeCard intake={dossier.intake} />
          <AiProgressAnalysis studentId={student.id} />
        </div>
      </div>
    </PWAPage>
  );
}
