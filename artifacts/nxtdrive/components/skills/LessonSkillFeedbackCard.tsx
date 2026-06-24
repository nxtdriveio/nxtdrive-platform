import { ClipboardList, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LessonSkillFeedbackGroup } from "@/lib/skills/student-leskaart-data";

/**
 * Read-only per-lesson skill feedback for the student/parent: the skills graded
 * during this lesson, grouped by hoofdcategorie, with the 1-8 grade. Critical
 * safety skills below niveau 8 are highlighted.
 */
export function LessonSkillFeedbackCard({
  groups,
}: {
  groups: LessonSkillFeedbackGroup[];
}) {
  if (groups.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <ClipboardList className="h-4 w-4" aria-hidden />
          Beoordeelde vaardigheden
        </div>

        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              <ul className="space-y-1.5">
                {g.skills.map((s) => {
                  const low = s.isCritical && s.score < 8;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {s.isCritical ? (
                          <ShieldAlert
                            className="h-4 w-4 shrink-0 text-warning"
                            aria-label="Kritieke veiligheidsvaardigheid"
                          />
                        ) : null}
                        <span className="truncate text-foreground">
                          {s.label}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
                          low
                            ? "bg-warning/15 text-warning"
                            : s.score >= 8
                              ? "bg-success/15 text-success"
                              : "bg-muted text-foreground",
                        )}
                      >
                        {s.score}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
