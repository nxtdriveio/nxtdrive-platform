import { LayoutGrid, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StudentCategoryProgress } from "@/lib/skills/student-leskaart-data";

/**
 * Read-only per-hoofdcategorie progress for the student/parent. Each bar shows
 * how far the curriculum category has developed (derived from the 1–10 grades),
 * the average where graded, and any critical-skill attention points.
 */
export function StudentCategoryProgressCard({
  categories,
}: {
  categories: StudentCategoryProgress[];
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Voortgang per categorie
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Je rijschool heeft nog geen vaardigheden in de leskaart.
          </p>
        ) : (
          <ul className="space-y-3.5">
            {categories.map((c) => (
              <li key={c.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{c.label}</span>
                    {c.criticalBelow > 0 ? (
                      <Badge variant="warning" className="gap-1">
                        <ShieldAlert className="h-3 w-3" aria-hidden />
                        {c.criticalBelow}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {c.averageScore != null ? (
                      <span className="font-semibold text-foreground">
                        ⌀ {c.averageScore.toFixed(1)}
                      </span>
                    ) : null}{" "}
                    · {c.progressPct}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={c.label}
                  aria-valuenow={c.progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${c.progressPct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
