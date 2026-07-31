"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/lib/lessons/types";
import type { AgendaTrialLesson } from "@/lib/trial-lessons/agenda";
import type { AgendaAppointmentView } from "@/lib/agenda/appointments";
import {
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_SHORT,
  durationMinutes,
  isStudentLinkedType,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

const dayFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "numeric",
  month: "long",
});

type DayItem =
  | { kind: "lesson"; starts_at: string; lesson: Lesson }
  | { kind: "trial"; starts_at: string; trial: AgendaTrialLesson }
  | { kind: "appointment"; starts_at: string; appointment: AgendaAppointmentView };

type AgendaVisual = {
  railClass: string;
  badgeClass: string;
  badgeLabel: string;
};

const APPOINTMENT_VISUALS: Record<AgendaAppointmentType, AgendaVisual> = {
  exam: {
    railClass: "bg-danger",
    badgeClass: "border-danger/35 bg-danger/12 text-danger",
    badgeLabel: "Examen",
  },
  interim_test: {
    railClass: "bg-warning",
    badgeClass: "border-warning/35 bg-warning/12 text-warning",
    badgeLabel: "TTT",
  },
  theory_guidance: {
    railClass: "bg-fuchsia-500",
    badgeClass: "border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-200",
    badgeLabel: "Theorie",
  },
  free_block: {
    railClass: "bg-info",
    badgeClass: "border-info/35 bg-info/12 text-info",
    badgeLabel: "Vrij blok",
  },
  break: {
    railClass: "bg-info",
    badgeClass: "border-info/35 bg-info/12 text-info",
    badgeLabel: "Pauze",
  },
  private_block: {
    railClass: "bg-slate-400",
    badgeClass: "border-slate-400/30 bg-slate-500/10 text-slate-200",
    badgeLabel: "Privé",
  },
  maintenance: {
    railClass: "bg-info",
    badgeClass: "border-info/35 bg-info/12 text-info",
    badgeLabel: "Onderhoud",
  },
  admin: {
    railClass: "bg-info",
    badgeClass: "border-info/35 bg-info/12 text-info",
    badgeLabel: "Administratie",
  },
  vacation: {
    railClass: "bg-slate-400",
    badgeClass: "border-slate-400/30 bg-slate-500/10 text-slate-200",
    badgeLabel: "Vakantie",
  },
};

function extractLessonId(pathname: string): string | undefined {
  const match = pathname.match(/^\/instructeur\/lessen\/([^/]+)$/);
  return match?.[1];
}

function itemDuration(item: DayItem): number {
  if (item.kind === "lesson") {
    return durationMinutes(item.lesson.starts_at, item.lesson.ends_at);
  }
  if (item.kind === "trial") {
    return item.trial.duration_min;
  }
  return durationMinutes(item.appointment.starts_at, item.appointment.ends_at);
}

function itemTitle(item: DayItem, studentNames: Map<string, string>) {
  if (item.kind === "lesson") {
    return studentNames.get(item.lesson.student_id) ?? "Leerling";
  }
  if (item.kind === "trial") {
    return `Proefles ${item.trial.lead_name}`;
  }
  return isStudentLinkedType(item.appointment.type)
    ? (item.appointment.student_name ??
      APPOINTMENT_TYPE_LABEL[item.appointment.type])
    : (item.appointment.title?.trim() || APPOINTMENT_TYPE_LABEL[item.appointment.type]);
}

function itemPlace(item: DayItem) {
  if (item.kind === "lesson") {
    return item.lesson.location ?? "Locatie volgt";
  }
  if (item.kind === "trial") {
    return item.trial.pickup_location ?? "Locatie volgt";
  }
  return item.appointment.location ?? item.appointment.team_name ?? "Locatie volgt";
}

function itemHref(item: DayItem) {
  if (item.kind === "lesson") {
    return `/instructeur/lessen/${item.lesson.id}`;
  }
  if (item.kind === "trial") {
    return "/instructeur/agenda";
  }
  return `/instructeur/agenda/${item.appointment.id}`;
}

function itemVisual(item: DayItem): AgendaVisual {
  if (item.kind === "lesson") {
    return {
      railClass: "bg-primary",
      badgeClass: "border-primary/35 bg-primary/12 text-primary",
      badgeLabel: "Rijles",
    };
  }
  if (item.kind === "trial") {
    return {
      railClass: "bg-success",
      badgeClass: "border-success/35 bg-success/12 text-success",
      badgeLabel: "Proefles",
    };
  }
  return APPOINTMENT_VISUALS[item.appointment.type] ?? {
    railClass: "bg-muted-foreground",
    badgeClass: "border-border/60 bg-muted/50 text-muted-foreground",
    badgeLabel: APPOINTMENT_TYPE_SHORT[item.appointment.type],
  };
}

function visibleWithinWindow(
  item: DayItem,
  visibleStartHour: number,
  visibleEndHour: number,
) {
  const startsAt = new Date(item.starts_at);
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const minStart = visibleStartHour * 60;
  const maxStart = visibleEndHour * 60;
  return startMinutes >= minStart && startMinutes < maxStart;
}

function sameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

export function InstructorDayList({
  lessons,
  studentNames,
  trialLessons = [],
  appointments = [],
  date,
  variant = "vertical",
  visibleStartHour = 6,
  visibleEndHour = 22,
}: {
  lessons: Lesson[];
  studentNames: Map<string, string>;
  trialLessons?: AgendaTrialLesson[];
  appointments?: AgendaAppointmentView[];
  date: Date;
  variant?: "vertical" | "horizontal";
  visibleStartHour?: number;
  visibleEndHour?: number;
}) {
  const pathname = usePathname() ?? "";
  const selectedId = extractLessonId(pathname);

  const items: DayItem[] = [
    ...lessons.map((lesson): DayItem => ({
      kind: "lesson",
      starts_at: lesson.starts_at,
      lesson,
    })),
    ...trialLessons.map((trial): DayItem => ({
      kind: "trial",
      starts_at: trial.starts_at,
      trial,
    })),
    ...appointments.map((appointment): DayItem => ({
      kind: "appointment",
      starts_at: appointment.starts_at,
      appointment,
    })),
  ]
    .filter((item) => sameLocalDay(new Date(item.starts_at), date))
    .filter((item) => visibleWithinWindow(item, visibleStartHour, visibleEndHour))
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  if (variant === "horizontal") {
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase text-muted-foreground">
            Vandaag
          </div>
          <div className="text-xs font-medium capitalize text-foreground">
            {dayFmt.format(date).split(" ")[0]}
          </div>
        </div>
        <div className="h-8 w-px shrink-0 bg-border" />
        {items.length === 0 ? (
          <span className="shrink-0 text-sm text-muted-foreground">
            Geen afspraken vandaag
          </span>
        ) : (
          items.map((item) => {
            const active = item.kind === "lesson" && item.lesson.id === selectedId;
            const visual = itemVisual(item);
            return (
              <Link
                key={`${item.kind}-${item.kind === "lesson" ? item.lesson.id : item.kind === "trial" ? item.trial.id : item.appointment.id}`}
                href={itemHref(item)}
                className={cn(
                  "relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-2 transition-colors",
                  active ? "border-primary/50 bg-primary-soft/50" : "hover:border-primary/30",
                )}
              >
                <span className={cn("absolute inset-y-2 left-0 w-1 rounded-full", visual.railClass)} />
                <span className="pl-2 text-xs font-semibold tabular-nums text-foreground">
                  {timeFmt.format(new Date(item.starts_at))}
                </span>
                <span className="max-w-[9rem] truncate pl-2 text-xs text-muted-foreground">
                  {itemTitle(item, studentNames)}
                </span>
              </Link>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="rounded-[1.2rem] border border-border/70 bg-background/55 px-3.5 py-3">
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">
          Agenda
        </div>
        <div className="mt-1 text-sm font-semibold capitalize text-foreground">
          {dayFmt.format(date)}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/45 px-4 py-3 text-sm text-muted-foreground">
            Geen lessen of afspraken binnen je zichtbare uren.
          </div>
        ) : (
          <ol className="space-y-2">
            {items.map((item) => {
              const id =
                item.kind === "lesson"
                  ? item.lesson.id
                  : item.kind === "trial"
                    ? item.trial.id
                    : item.appointment.id;
              const visual = itemVisual(item);
              const active = item.kind === "lesson" && item.lesson.id === selectedId;

              return (
                <li key={`${item.kind}-${id}`}>
                  <Link
                    href={itemHref(item)}
                    className={cn(
                      "group relative block overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/48 px-3.5 py-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-background/72",
                      active ? "border-primary/45 bg-primary-soft/40" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-3 left-0.5 w-1 rounded-full",
                        visual.railClass,
                      )}
                      aria-hidden
                    />

                    <div className="flex items-start gap-3 pl-2">
                      <div className="w-[3.7rem] shrink-0">
                        <p className="text-sm font-bold leading-none text-foreground">
                          {timeFmt.format(new Date(item.starts_at))}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {itemDuration(item)} min
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {itemTitle(item, studentNames)}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {itemPlace(item)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold",
                              visual.badgeClass,
                            )}
                          >
                            {visual.badgeLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Link
        href="/instructeur/agenda"
        className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-[1.15rem] border border-border/70 bg-background/65 px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-muted"
      >
        <CalendarRange className="h-4 w-4" aria-hidden />
        Volledige agenda
      </Link>
    </div>
  );
}
