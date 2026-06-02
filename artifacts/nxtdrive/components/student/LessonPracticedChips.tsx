import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type PracticedSkill = {
  id: string;
  label: string;
  isCritical: boolean;
};

/**
 * "Vandaag geoefend" chips for the student lesson detail: the skills graded
 * during this lesson, shown as labelled chips with a check icon. Read-only.
 */
export function LessonPracticedChips({
  skills,
}: {
  skills: PracticedSkill[];
}) {
  if (skills.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Vandaag geoefend
        </div>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/40 px-3 py-1 text-sm text-foreground"
            >
              {s.isCritical ? (
                <ShieldAlert
                  className="h-3.5 w-3.5 text-warning"
                  aria-label="Kritieke veiligheidsvaardigheid"
                />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
              )}
              {s.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
