import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import {
  TRIAL_LESSON_STATUS_LABEL,
  TRIAL_LESSON_STATUS_VARIANT,
} from "@/lib/trial-lessons/types";
import type { AgendaTrialLesson } from "@/lib/trial-lessons/agenda";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

type DayItem =
  | { kind: "lesson"; starts_at: string; lesson: Lesson }
  | { kind: "trial"; starts_at: string; trial: AgendaTrialLesson };

export function InstructorDayList({
  lessons,
  studentNames,
  trialLessons = [],
  selectedId,
  date,
}: {
  lessons: Lesson[];
  studentNames: Map<string, string>;
  trialLessons?: AgendaTrialLesson[];
  selectedId?: string;
  date: Date;
}) {
  const items: DayItem[] = [
    ...lessons.map(
      (l): DayItem => ({ kind: "lesson", starts_at: l.starts_at, lesson: l }),
    ),
    ...trialLessons.map(
      (t): DayItem => ({ kind: "trial", starts_at: t.starts_at, trial: t }),
    ),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="flex h-full flex-col">
      <div className="px-1 pb-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Vandaag
        </div>
        <div className="mt-0.5 text-sm font-medium capitalize text-foreground">
          {dayFmt.format(date)}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Geen lessen vandaag. Tijd voor koffie ☕
        </div>
      ) : (
        <ol className="space-y-1.5 overflow-y-auto pr-1">
          {items.map((item) =>
            item.kind === "lesson" ? (
              <li key={`lesson-${item.lesson.id}`}>
                <Link
                  href={`/instructor/${item.lesson.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    item.lesson.id === selectedId
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-card hover:border-muted-foreground/40",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      item.lesson.id === selectedId
                        ? "text-primary"
                        : "text-foreground",
                    )}
                  >
                    {timeFmt.format(new Date(item.lesson.starts_at))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {studentNames.get(item.lesson.student_id) ?? "Leerling"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {Math.round(
                        (new Date(item.lesson.ends_at).getTime() -
                          new Date(item.lesson.starts_at).getTime()) /
                          60000,
                      )}{" "}
                      min · {item.lesson.location ?? "—"}
                    </div>
                  </div>
                  {item.lesson.status !== "planned" ? (
                    <Badge
                      variant={LESSON_STATUS_VARIANT[item.lesson.status]}
                      className="shrink-0"
                    >
                      {LESSON_STATUS_LABEL[item.lesson.status]}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            ) : (
              <li key={`trial-${item.trial.id}`}>
                <Link
                  href={`/backoffice/leads/${item.trial.lead_id}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-info/60 bg-info/5 px-3 py-2.5 transition-colors hover:border-info"
                >
                  <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {timeFmt.format(new Date(item.trial.starts_at))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {item.trial.lead_name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-info">Proefles</span> ·{" "}
                      {item.trial.duration_min} min ·{" "}
                      {item.trial.pickup_location ?? "—"}
                    </div>
                  </div>
                  <Badge
                    variant={TRIAL_LESSON_STATUS_VARIANT[item.trial.status]}
                    className="shrink-0"
                  >
                    {TRIAL_LESSON_STATUS_LABEL[item.trial.status]}
                  </Badge>
                </Link>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
