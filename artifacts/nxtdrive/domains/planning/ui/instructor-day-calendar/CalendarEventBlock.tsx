import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  CarFront,
  ClipboardCheck,
  Coffee,
  Flag,
  GraduationCap,
  UserRound,
  Wrench,
} from "lucide-react";
import type { CSSProperties } from "react";
import {
  appointmentTypePresentation,
  type AppointmentCalendarTone,
} from "../../application/appointment-type-catalog";
import type {
  CalendarEventLayout,
  InstructorDayAgendaItem,
  VisibleCalendarInterval,
} from "../../domain/instructor-day-calendar";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<AppointmentCalendarTone, string> = {
  BLUE: "border-blue-300/80 bg-blue-100/95 text-blue-950 dark:border-blue-500/50 dark:bg-blue-950/80 dark:text-blue-50",
  VIOLET:
    "border-violet-300/80 bg-violet-100/95 text-violet-950 dark:border-violet-500/50 dark:bg-violet-950/80 dark:text-violet-50",
  ROSE: "border-rose-300/80 bg-rose-100/95 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/80 dark:text-rose-50",
  AMBER:
    "border-amber-300/80 bg-amber-100/95 text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/80 dark:text-amber-50",
  GREEN:
    "border-emerald-300/80 bg-emerald-100/95 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-950/80 dark:text-emerald-50",
  TEAL: "border-teal-300/80 bg-teal-100/95 text-teal-950 dark:border-teal-500/50 dark:bg-teal-950/80 dark:text-teal-50",
  NEUTRAL:
    "border-slate-300/90 bg-slate-100/95 text-slate-900 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-50",
  SAND: "border-stone-300/90 bg-stone-100/95 text-stone-900 dark:border-stone-600 dark:bg-stone-800/95 dark:text-stone-50",
};

const ICONS = {
  car: CarFront,
  graduation: GraduationCap,
  flag: Flag,
  clipboard: ClipboardCheck,
  coffee: Coffee,
  user: UserRound,
  calendar: CalendarDays,
  tools: Wrench,
  book: BookOpen,
};

export function CalendarEventBlock({
  layout,
  interval,
  top,
  height,
  timeLabel,
  dateLabel,
  isCurrent,
  isPast,
  onOpen,
}: {
  layout: CalendarEventLayout<InstructorDayAgendaItem>;
  interval: VisibleCalendarInterval;
  top: number;
  height: number;
  timeLabel: string;
  dateLabel: string;
  isCurrent: boolean;
  isPast: boolean;
  onOpen: (item: InstructorDayAgendaItem) => void;
}) {
  const item = layout.event;
  const presentation = appointmentTypePresentation(item.type);
  const Icon = ICONS[presentation.icon];
  const width = (layout.columnSpan / layout.columnCount) * 100;
  const left = (layout.column / layout.columnCount) * 100;
  const compact = interval.durationMinutes < 45 || layout.columnCount >= 3;
  const tiny = interval.durationMinutes <= 20;
  const location = item.location?.formattedAddress ?? item.location?.label;
  const accessibleLabel = [
    presentation.label,
    item.participantLabel ? `met ${item.participantLabel}` : null,
    dateLabel,
    timeLabel.replace("–", "tot"),
    location ? `locatie ${location}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      aria-label={accessibleLabel}
      data-calendar-event={item.id}
      data-calendar-tone={presentation.calendarTone.toLowerCase()}
      className={cn(
        "group absolute z-20 overflow-hidden rounded-[0.8rem] border px-2 py-1.5 text-left shadow-[0_1px_2px_rgb(15_23_42/0.06)] outline-none transition-[filter,box-shadow] focus-visible:z-40 focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:ring-offset-1 motion-reduce:transition-none",
        TONE_CLASS[presentation.calendarTone],
        compact && "rounded-lg px-1.5 py-1",
        tiny && "py-0.5",
        isCurrent && "ring-2 ring-brand-primary/55 ring-offset-1",
        isPast && "saturate-[0.72]",
      )}
      style={
        {
          top,
          height,
          left: `calc(${left}% + 2px)`,
          width: `calc(${width}% - 4px)`,
        } as CSSProperties
      }
    >
      {interval.startsBeforeWindow || interval.endsAfterWindow ? (
        <span className="absolute inset-x-0 top-0 h-0.5 bg-current/45" />
      ) : null}
      <span className="flex min-w-0 items-center gap-1 font-black leading-none">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate text-[11px] sm:text-xs">
          {isCurrent ? "NU · " : ""}
          {tiny ? `${timeLabel.split("–")[0]?.trim()} · ` : ""}
          {presentation.shortLabel}
        </span>
      </span>
      {!tiny ? (
        <span className="mt-1 block truncate text-[10px] font-semibold tabular-nums opacity-75 sm:text-[11px]">
          {timeLabel}
        </span>
      ) : null}
      {!compact && item.participantLabel ? (
        <span className="mt-0.5 block truncate text-xs font-bold">
          {item.participantLabel}
        </span>
      ) : compact && !tiny && item.participantLabel ? (
        <span className="mt-0.5 block truncate text-[10px] font-bold">
          {item.participantLabel}
        </span>
      ) : null}
      {!compact && location ? (
        <span className="mt-0.5 block truncate text-[10px] opacity-70">
          {location}
        </span>
      ) : null}
      {interval.startsBeforeWindow && height >= 34 ? (
        <span className="mt-1 flex items-center gap-1 truncate text-[9px] font-bold opacity-75">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
          Begonnen vóór 07:00
        </span>
      ) : null}
      {interval.endsAfterWindow && height >= 34 ? (
        <span className="mt-1 flex items-center gap-1 truncate text-[9px] font-bold opacity-75">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
          Loopt door na 22:00
        </span>
      ) : null}
    </button>
  );
}
