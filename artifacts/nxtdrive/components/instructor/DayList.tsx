import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function InstructorDayList({
  lessons,
  studentNames,
  selectedId,
  date,
}: {
  lessons: Lesson[];
  studentNames: Map<string, string>;
  selectedId?: string;
  date: Date;
}) {
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

      {lessons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Geen lessen vandaag. Tijd voor koffie ☕
        </div>
      ) : (
        <ol className="space-y-1.5 overflow-y-auto pr-1">
          {lessons.map((l) => {
            const active = l.id === selectedId;
            return (
              <li key={l.id}>
                <Link
                  href={`/instructor/${l.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    active
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-card hover:border-muted-foreground/40",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      active ? "text-primary" : "text-foreground",
                    )}
                  >
                    {timeFmt.format(new Date(l.starts_at))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {studentNames.get(l.student_id) ?? "Leerling"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {Math.round(
                        (new Date(l.ends_at).getTime() -
                          new Date(l.starts_at).getTime()) /
                          60000,
                      )}{" "}
                      min · {l.location ?? "—"}
                    </div>
                  </div>
                  {l.status !== "planned" ? (
                    <Badge
                      variant={LESSON_STATUS_VARIANT[l.status]}
                      className="shrink-0"
                    >
                      {LESSON_STATUS_LABEL[l.status]}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
