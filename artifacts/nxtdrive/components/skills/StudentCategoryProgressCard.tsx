import { LayoutGrid, ShieldAlert } from "lucide-react";
import { PWACard, PWAEmptyState } from "@/components/pwa/primitives";
import { Badge } from "@/components/ui/badge";
import type { StudentCategoryProgress } from "@/lib/skills/student-leskaart-data";

/**
 * Read-only per-hoofdcategorie progress for the student/parent. Each bar shows
 * how far the curriculum category has developed (derived from the N/1-8 grades),
 * the average where graded, and any critical-skill attention points.
 */
export function StudentCategoryProgressCard({
  categories,
}: {
  categories: StudentCategoryProgress[];
}) {
  return (
    <PWACard
      title={
        <>
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          Voortgang per categorie
        </>
      }
    >
      {categories.length === 0 ? (
        <PWAEmptyState
          icon={<LayoutGrid className="h-8 w-8" aria-hidden />}
          title="Nog geen categorieën"
          message="Je rijschool heeft nog geen vaardigheden in de leskaart."
        />
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
    </PWACard>
  );
}
