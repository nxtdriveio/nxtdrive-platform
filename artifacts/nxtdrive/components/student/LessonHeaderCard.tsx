import {
  CalendarDays,
  Clock,
  User,
  Car,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Leskaart lesson-detail header (student view): date, time + driven duration,
 * instructor and lesson type, with the lesson status badge. Mirrors the
 * "Digitale leskaart" mockup; completed lessons read "Afgerond".
 */
export function LessonHeaderCard({
  lesson,
  instructorName,
}: {
  lesson: Lesson;
  instructorName?: string | null;
}) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const durMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const isCompleted = lesson.status === "completed";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <dl className="space-y-2.5 text-sm">
            <Row icon={CalendarDays}>
              <span className="font-medium capitalize text-foreground">
                {dateFmt.format(start)}
              </span>
            </Row>
            <Row icon={Clock}>
              <span className="text-foreground">
                {timeFmt.format(start)} – {timeFmt.format(end)}
              </span>
            </Row>
            {instructorName ? (
              <Row icon={User}>
                <span className="text-foreground">{instructorName}</span>
              </Row>
            ) : null}
            <Row icon={Car}>
              <span className="text-foreground">Rijles · {durMin} min</span>
            </Row>
          </dl>

          {isCompleted ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Afgerond
            </Badge>
          ) : (
            <Badge variant={LESSON_STATUS_VARIANT[lesson.status]}>
              {LESSON_STATUS_LABEL[lesson.status]}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  icon: Icon,
  children,
}: {
  icon: typeof CalendarDays;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      {children}
    </div>
  );
}
