import { CalendarDays } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentLessonCard,
  StudentLessonTable,
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentAgendaPage() {
  const { experience } = await getStudentPwaContext();
  const upcoming = [experience.nextLesson];
  const previous = experience.previousLessons;

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Agenda"
        title="Je lessen"
        subtitle="Bekijk je geplande lessen, eerdere lessen en gepubliceerde feedback."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <StudentSection title="Komende lessen" icon={CalendarDays}>
          <div className="space-y-3">
            {upcoming.map((lesson) => (
              <StudentLessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        </StudentSection>

        <StudentSection title="Vorige lessen" icon={CalendarDays}>
          <div className="space-y-3 lg:hidden">
            {previous.map((lesson) => (
              <StudentLessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
          <StudentLessonTable lessons={previous} />
        </StudentSection>
      </div>
    </div>
  );
}
