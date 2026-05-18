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
const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function StudentLessonCard({
  lesson,
  selected = false,
  showDate = false,
  href,
}: {
  lesson: Lesson;
  selected?: boolean;
  showDate?: boolean;
  href?: string;
}) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const durMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const target = href ?? `/student/lessons/${lesson.id}`;
  return (
    <Link
      href={target}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors",
        selected
          ? "border-primary bg-primary-soft"
          : "border-border bg-card hover:border-muted-foreground/40",
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
        <div className="text-xs text-muted-foreground">
          {durMin} min · {lesson.credits_cost} credits
        </div>
      </div>
      <Badge
        variant={LESSON_STATUS_VARIANT[lesson.status]}
        className="shrink-0"
      >
        {LESSON_STATUS_LABEL[lesson.status]}
      </Badge>
    </Link>
  );
}
