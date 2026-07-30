import Link from "next/link";
import { cn } from "@/lib/utils";
import { PWAStatusBadge } from "@/components/pwa/primitives";
import { type Lesson } from "@/lib/lessons/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import { formatTegoed } from "@/lib/students/types";

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = createNlDateTimeFormatter({
  weekday: "short",
  day: "numeric",
  month: "short",
});

/**
 * A lesson row card that links through to the lesson detail.
 * Uses the same `rounded-2xl border border-border bg-card shadow-sm` shell as
 * PWACard so it is visually consistent with all other PWA card primitives.
 * The outer element is a `<Link>` (not a `<div>`) so the entire tile is tappable.
 */
export function StudentLessonCard({
  lesson,
  selected = false,
  showDate = false,
  href,
  instructorName,
}: {
  lesson: Lesson;
  selected?: boolean;
  showDate?: boolean;
  href?: string;
  instructorName?: string | null;
}) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const durMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const target = href ?? `/leerling/lessen/${lesson.id}`;
  return (
    <Link
      href={target}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 shadow-sm transition-colors",
        selected
          ? "border-primary bg-primary-soft"
          : "border-border hover:border-muted-foreground/40",
      )}
    >
      <div className="shrink-0 text-center tabular-nums">
        {showDate ? (
          <div className="text-xs capitalize text-muted-foreground">
            {dateFmt.format(start)}
          </div>
        ) : null}
        <div
          className={cn(
            "text-sm font-semibold",
            selected ? "text-primary" : "text-foreground",
          )}
        >
          {timeFmt.format(start)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {lesson.location ?? "Locatie volgt"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {durMin} min · {formatTegoed(lesson.credits_cost)}
          {instructorName ? ` · ${instructorName}` : ""}
        </div>
      </div>
      <PWAStatusBadge status={lesson.status} domain="lesson" />
    </Link>
  );
}
