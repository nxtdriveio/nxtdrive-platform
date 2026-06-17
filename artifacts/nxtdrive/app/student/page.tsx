import { BadgeCheck, BookOpen, CalendarDays, Route, Wallet } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentAICoachCard,
  StudentActivityList,
  StudentEmptyState,
  StudentHeroNextStepCard,
  StudentLessonCard,
  StudentLessonTable,
  StudentModuleProgressList,
  StudentPageHeader,
  StudentPaymentBalanceCard,
  StudentQuickActionGrid,
  StudentReadinessCard,
  StudentSection,
  StudentStatCard,
  StudentTheoryProgressCard,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  const { student, experience } = await getStudentPwaContext();

  if (!student) {
    return (
      <StudentEmptyState
        title="Welkom bij NXTDRIVE"
        message="Je account is nog niet gekoppeld aan een leerlingdossier. Neem contact op met je rijschool om dit in orde te maken."
      />
    );
  }

  const allLessons = [experience.nextLesson, ...experience.previousLessons];

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow={experience.profile.tenantName}
        title={`Goedemorgen, ${experience.profile.firstName}`}
        subtitle="Klaar voor je volgende stap? Alles wat belangrijk is staat direct voor je klaar."
      />

      <StudentHeroNextStepCard {...experience.nextStep} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StudentStatCard
          label="Volgende les"
          value={experience.nextLesson.dateLabel}
          hint={`${experience.nextLesson.timeLabel} - ${experience.nextLesson.location}`}
          icon={CalendarDays}
          href="/student/agenda"
        />
        <StudentStatCard
          label="Voortgang"
          value="68%"
          hint="Je bent goed op weg"
          icon={Route}
          href="/student/journey"
        />
        <StudentStatCard
          label="Tegoed"
          value={experience.payments.balance.creditLabel}
          hint={experience.payments.balance.hoursAvailable}
          icon={Wallet}
          href="/student/payments"
        />
        <StudentStatCard
          label="Examens"
          value="85%"
          hint="Verwachte gereedheid"
          icon={BadgeCheck}
          href="/student/cbr-exams"
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <div className="min-w-0 space-y-4 lg:space-y-5">
          <StudentSection title="Volgende les" icon={CalendarDays}>
            <StudentLessonCard lesson={experience.nextLesson} />
          </StudentSection>

          <StudentSection title="Snelle acties">
            <StudentQuickActionGrid actions={experience.quickActions} />
          </StudentSection>

          <StudentSection title="Jouw rijbewijsreis" icon={Route}>
            <StudentModuleProgressList modules={experience.journeyModules} />
          </StudentSection>

          <StudentSection title="Laatste lessen" icon={CalendarDays}>
            <div className="space-y-3 lg:hidden">
              {allLessons.map((lesson) => (
                <StudentLessonCard key={lesson.id} lesson={lesson} />
              ))}
            </div>
            <StudentLessonTable lessons={allLessons} />
          </StudentSection>
        </div>

        <aside className="min-w-0 space-y-4 lg:space-y-5">
          <StudentAICoachCard />
          <StudentTheoryProgressCard theory={experience.theory} />
          <StudentReadinessCard
            readiness={experience.cbr.readiness}
            copy={experience.cbr.readinessCopy}
          />
          <StudentPaymentBalanceCard balance={experience.payments.balance} />
          <StudentSection title="Laatste activiteit" icon={BookOpen}>
            <StudentActivityList items={experience.activity} />
          </StudentSection>
        </aside>
      </div>
    </div>
  );
}
