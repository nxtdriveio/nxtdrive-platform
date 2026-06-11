import { CheckCircle2, ShieldAlert } from "lucide-react";
import { StudentShowcaseCard } from "@/components/student/Showcase";

type PracticedSkill = {
  id: string;
  label: string;
  isCritical: boolean;
};

export function LessonPracticedChips({
  skills,
}: {
  skills: PracticedSkill[];
}) {
  if (skills.length === 0) return null;

  return (
    <StudentShowcaseCard
      title="Vandaag geoefend"
      eyebrow="Onderdelen"
      info="Dit zijn de vaardigheden die tijdens deze les expliciet zijn beoordeeld."
    >
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/24 bg-primary/10 px-3 py-1.5 text-sm text-white/78"
          >
            {skill.isCritical ? (
              <ShieldAlert
                className="h-3.5 w-3.5 text-amber-300"
                aria-label="Kritieke veiligheidsvaardigheid"
              />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
            )}
            {skill.label}
          </span>
        ))}
      </div>
    </StudentShowcaseCard>
  );
}
