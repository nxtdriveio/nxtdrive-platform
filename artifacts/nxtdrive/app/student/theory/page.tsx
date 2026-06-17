import { BookOpen, Route } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentPageHeader,
  StudentSection,
  StudentTheoryList,
  StudentTheoryProgressCard,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentTheoryPage() {
  const { experience } = await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Theorie"
        title="Theorie overzicht"
        subtitle="Je voortgang, open huiswerk en toetsen in een rustige mobiele workflow."
      />

      <div className="flex gap-2 overflow-x-auto pb-1 text-sm font-bold">
        {["Overzicht", "Huiswerk", "Toetsen"].map((tab, index) => (
          <span
            key={tab}
            className={
              index === 0
                ? "rounded-full bg-brand-primary px-4 py-2 text-brand-primary-foreground"
                : "rounded-full border border-brand-border bg-card px-4 py-2 text-brand-muted-foreground"
            }
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <StudentTheoryProgressCard theory={experience.theory} />
          <StudentSection title="Koppeling met je rijlessen" icon={Route}>
            <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 p-4 text-sm leading-6 text-brand-muted-foreground shadow-brand-card">
              Dit helpt je bij verkeersinzicht en voorrangssituaties. Je
              instructeur neemt deze onderdelen mee in je volgende lessen.
            </div>
          </StudentSection>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
          <StudentSection title="Huiswerk" icon={BookOpen}>
            <StudentTheoryList title="Open huiswerk" items={experience.theory.homework} />
          </StudentSection>
          <StudentSection title="Toetsen" icon={BookOpen}>
            <StudentTheoryList title="Beschikbare toetsen" items={experience.theory.tests} />
          </StudentSection>
        </div>
      </div>
    </div>
  );
}
