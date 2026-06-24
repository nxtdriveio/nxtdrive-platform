import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PWACard, PWAEmptyState } from "@/components/pwa/primitives";
import { cn } from "@/lib/utils";
import type { StudentLessonPoint } from "@/lib/skills/student-leskaart-data";

const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "2-digit",
});

/**
 * Read-only development-over-time trend for the student/parent: the average
 * grade per scored lesson, oldest → newest, as a compact bar chart. Shows the
 * most recent lessons so the picture stays readable on mobile.
 */
export function StudentTrendCard({
  history,
}: {
  history: StudentLessonPoint[];
}) {
  // Keep the last 10 scored lessons for a clean mobile view.
  const points = history.slice(-10);

  if (points.length < 2) {
    return (
      <PWACard
        title={
          <>
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Ontwikkeling over tijd
          </>
        }
      >
        <PWAEmptyState
          icon={<TrendingUp className="h-8 w-8" aria-hidden />}
          title="Nog geen ontwikkeling"
          message="Na een paar beoordeelde lessen zie je hier je ontwikkeling over tijd."
        />
      </PWACard>
    );
  }

  const first = points[0].averageScore;
  const last = points[points.length - 1].averageScore;
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-4 w-4" aria-hidden />
            Ontwikkeling over tijd
          </div>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              delta > 0
                ? "text-success"
                : delta < 0
                  ? "text-danger"
                  : "text-muted-foreground",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} sinds start
          </span>
        </div>

        <div className="flex items-end justify-between gap-1.5">
          {points.map((p) => {
            const h = Math.max(6, (Math.min(8, p.averageScore) / 8) * 100);
            return (
              <div
                key={p.lessonId}
                role="img"
                aria-label={`${dayFmt.format(new Date(p.startsAt))}: gemiddeld ${p.averageScore.toFixed(1)} van 8`}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${dayFmt.format(new Date(p.startsAt))}: gemiddeld ${p.averageScore.toFixed(1)}`}
              >
                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                  {p.averageScore.toFixed(1)}
                </span>
                <div className="flex h-20 w-full items-end">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${h}%` }}
                    aria-hidden
                  />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {dayFmt.format(new Date(p.startsAt))}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
