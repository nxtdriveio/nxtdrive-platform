import {
  CalendarDays,
  CheckCircle2,
  Clock,
  User,
  Car,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  StudentShowcaseCard,
} from "@/components/student/Showcase";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";

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

export function LessonHeaderCard({
  lesson,
  instructorName,
}: {
  lesson: Lesson;
  instructorName?: string | null;
}) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const isCompleted = lesson.status === "completed";

  return (
    <StudentShowcaseCard
      title="Lesdetails"
      eyebrow="Overzicht"
      actionLabel="Alle lessen"
      actionHref="/leerling/lessen"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold capitalize text-white">
              {dateFmt.format(start)}
            </div>
            <div className="mt-1 text-sm text-white/54">
              {timeFmt.format(start)} - {timeFmt.format(end)}
            </div>
          </div>
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

        <div className="grid grid-cols-2 gap-2">
          <InfoTile
            icon={Clock}
            label="Tijdslot"
            value={`${timeFmt.format(start)} - ${timeFmt.format(end)}`}
          />
          <InfoTile icon={Car} label="Duur" value={`${durationMin} min`} />
          {instructorName ? (
            <InfoTile icon={User} label="Instructeur" value={instructorName} />
          ) : null}
          <InfoTile icon={CalendarDays} label="Type" value="Rijles" />
        </div>

      </div>
    </StudentShowcaseCard>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase text-white/42">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
