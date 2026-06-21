import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MessageCircle, Route } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { findLessonById } from "@/lib/student-pwa/service";
import {
  StudentLessonCard,
  StudentLessonTimeline,
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function StudentLessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const { experience } = await getStudentPwaContext();
  const lesson = findLessonById(experience, lessonId);

  if (!lesson) notFound();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <Link
        href="/student/agenda"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-muted-foreground hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Terug naar agenda
      </Link>

      <StudentPageHeader
        eyebrow="Lesdetail"
        title={lesson.dateLabel}
        subtitle={`${lesson.timeLabel} - ${lesson.location}`}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <StudentSection title="Les" icon={CalendarDays}>
            <StudentLessonCard lesson={lesson} />
          </StudentSection>
          <StudentSection title="Tijdlijn" icon={Route}>
            <StudentLessonTimeline lesson={lesson} />
          </StudentSection>
        </div>

        <div className="space-y-4">
          <StudentSection title="Waar gaan we aan werken?" icon={Route}>
            <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 p-4 shadow-brand-card">
              <ul className="space-y-2 text-sm leading-6 text-brand-muted-foreground">
                {lesson.preparation.length > 0
                  ? lesson.preparation.map((item) => <li key={item}>{item}</li>)
                  : ["Je instructeur bespreekt de focus aan het begin van de les."].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
              </ul>
            </div>
          </StudentSection>

          {lesson.publishedReflection ? (
            <StudentSection title="Gepubliceerde reflectie" icon={MessageCircle}>
              <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 p-4 shadow-brand-card">
                <h2 className="text-sm font-black text-brand-foreground">
                  {lesson.publishedReflection.summary}
                </h2>
                <p className="mt-2 text-sm leading-6 text-brand-muted-foreground">
                  {lesson.publishedReflection.feedback}
                </p>
                <p className="mt-3 rounded-2xl bg-brand-accent px-3 py-2 text-sm font-bold text-brand-primary">
                  Volgende focus: {lesson.publishedReflection.nextFocus}
                </p>
              </div>
            </StudentSection>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/student/messages/instructor" className={buttonVariants()}>
              Bericht instructeur
            </Link>
            <Link href="/student/agenda" className={buttonVariants({ variant: "outline" })}>
              Bekijk route
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
