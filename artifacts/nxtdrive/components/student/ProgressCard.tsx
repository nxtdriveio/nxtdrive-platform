import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import { formatTegoed } from "@/lib/students/types";

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "numeric",
  month: "long",
});

function Ring({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (safe / 100) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24" aria-hidden>
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-muted"
        strokeWidth="10"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-primary"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        className="fill-foreground text-[20px] font-bold"
      >
        {Math.round(safe)}%
      </text>
    </svg>
  );
}

export function StudentProgressCard({
  lesson,
  instructorName,
}: {
  lesson: Lesson;
  instructorName?: string | null;
}) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const durMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const pct =
    lesson.progress_score != null
      ? (Math.min(8, lesson.progress_score) / 8) * 100
      : 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Jouw les
            </div>
            <div className="mt-0.5 text-sm font-medium capitalize text-foreground">
              {dateFmt.format(start)}
            </div>
            <div className="text-sm text-muted-foreground">
              {timeFmt.format(start)}–{timeFmt.format(end)} · {durMin} min
            </div>
          </div>
          <Badge variant={LESSON_STATUS_VARIANT[lesson.status]}>
            {LESSON_STATUS_LABEL[lesson.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <Ring pct={pct} />
          <div className="flex-1 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Voortgangscore</span>
              <span className="font-semibold text-foreground tabular-nums">
                {lesson.progress_score != null
                  ? `${Math.min(8, lesson.progress_score)} / 8`
                  : "Nog niet beoordeeld"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Tegoed</span>
              <span className="font-semibold text-foreground tabular-nums">
                {formatTegoed(lesson.credits_cost)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {instructorName ? (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="text-foreground">Instructeur:</span>{" "}
              {instructorName}
            </div>
          ) : null}
          {lesson.location ? (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="text-foreground">Locatie:</span> {lesson.location}
            </div>
          ) : null}
        </div>

        {lesson.progress_summary ? (
          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground">
              Toelichting van je instructeur
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {lesson.progress_summary}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
