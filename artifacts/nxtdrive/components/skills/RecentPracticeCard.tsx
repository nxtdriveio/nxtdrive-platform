import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PWAEmptyState } from "@/components/pwa/primitives";
import type { RecentlyPracticed } from "@/lib/skills/student-leskaart-data";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Read-only "vandaag geoefend" overview for the student/parent: the skills
 * graded in the most recent lesson, with their 1-8 grade.
 */
export function RecentPracticeCard({
  recent,
}: {
  recent: RecentlyPracticed | null | undefined;
}) {
  if (!recent) {
    return (
      <PWAEmptyState
        icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
        title="Nog niet geoefend"
        message="Er zijn nog geen geoefende vaardigheden gevonden."
      />
    );
  }

  return (
    <Card className="border-primary/30 bg-primary-soft/30">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {recent.isToday ? "Vandaag geoefend" : "Laatst geoefend"} (
          {recent.skills.length})
        </div>
        {!recent.isToday ? (
          <p className="text-xs capitalize text-muted-foreground">
            {dateFmt.format(new Date(recent.startsAt))}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {recent.skills.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs text-foreground shadow-sm"
            >
              {s.isCritical ? (
                <ShieldAlert
                  className="h-3 w-3 text-warning"
                  aria-label="Kritieke veiligheidsvaardigheid"
                />
              ) : null}
              {s.label}
              <span className="font-semibold tabular-nums text-primary">
                {s.score}
              </span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
