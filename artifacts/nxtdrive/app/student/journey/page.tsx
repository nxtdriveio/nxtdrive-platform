import Link from "next/link";
import { BadgeCheck, Route } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentAICoachCard,
  StudentDevelopmentChart,
  StudentLessonCard,
  StudentModuleProgressList,
  StudentPageHeader,
  StudentReadinessCard,
  StudentSection,
} from "@/components/student/StudentPwa";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function StudentJourneyPage() {
  const { experience } = await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Mijn reis"
        title="Je voortgang in begrijpelijke stappen"
        subtitle="Bekijk waar je staat, wat al goed gaat en welke focus je helpt richting je praktijkexamen."
        action={
          <Link href="/student/journey/ris" className={buttonVariants({ variant: "outline", size: "sm" })}>
            RIS leskaart
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <StudentSection title="Module overzicht" icon={Route}>
            <StudentModuleProgressList modules={experience.journeyModules} />
          </StudentSection>
          <StudentSection title="Recente lessen">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              {experience.previousLessons.map((lesson) => (
                <StudentLessonCard key={lesson.id} lesson={lesson} />
              ))}
            </div>
          </StudentSection>
        </div>

        <div className="min-w-0 space-y-4">
          <StudentDevelopmentChart data={experience.journeyTrend} />
          <StudentReadinessCard
            readiness={experience.cbr.readiness}
            copy={experience.cbr.readinessCopy}
          />
          <StudentAICoachCard />
          <StudentSection title="Klaar voor de volgende stap?" icon={BadgeCheck}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/student/agenda" className={buttonVariants({ className: "w-full" })}>
                Plan je volgende les
              </Link>
              <Link
                href="/student/journey/ris"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                Bekijk ontwikkelpunten
              </Link>
            </div>
          </StudentSection>
        </div>
      </div>
    </div>
  );
}
