"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_IN_PROGRESS_CARD,
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import {
  TRIAL_LESSON_STATUS_LABEL,
  TRIAL_LESSON_STATUS_VARIANT,
} from "@/lib/trial-lessons/types";
import type { AgendaTrialLesson } from "@/lib/trial-lessons/agenda";
import type { AgendaAppointmentView } from "@/lib/agenda/appointments";
import {
  APPOINTMENT_TYPE_ACCENT,
  APPOINTMENT_TYPE_LABEL,
  durationMinutes,
  isStudentLinkedType,
} from "@/lib/agenda/types";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const SLOT_HEIGHT = 74;

function isCurrentHour(date: Date, hour: number) {
  const now = new Date();
  return (
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate() &&
    now.getHours() === hour
  );
}

function sameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

type DayItem =
  | { kind: "lesson"; starts_at: string; lesson: Lesson }
  | { kind: "trial"; starts_at: string; trial: AgendaTrialLesson }
  | { kind: "appointment"; starts_at: string; appointment: AgendaAppointmentView };

function extractLessonId(pathname: string): string | undefined {
  const match = pathname.match(/^\/instructor\/([^/]+)$/);
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
    return item.trial.lead_name;
  }
  return isStudentLinkedType(item.appointment.type)
    ? (item.appointment.student_name ??
      APPOINTMENT_TYPE_LABEL[item.appointment.type])
    : (item.appointment.title?.trim() || APPOINTMENT_TYPE_LABEL[item.appointment.type]);
}

function itemSubtitle(item: DayItem) {
  if (item.kind === "lesson") {
    return item.lesson.location ?? "Leslocatie volgt";
  }
  if (item.kind === "trial") {
    return item.trial.pickup_location ?? "Proefleslocatie volgt";
  }
  return item.appointment.location ?? "Geen locatie";
}

function itemHref(item: DayItem) {
  if (item.kind === "lesson") {
    return `/instructor/${item.lesson.id}`;
  }
  if (item.kind === "trial") {
    return "/instructor/intake";
  }
  return `/instructor/afspraak/${item.appointment.id}`;
}

function hourRange(startHour: number, endHour: number) {
  return Array.from({ length: Math.max(0, endHour - startHour) }, (_, index) => startHour + index);
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
  const [now, setNow] = useState(() => new Date());
  const timelineRef = useRef<HTMLDivElement>(null);

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
  ].sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(handle);
  }, []);

  const hours = hourRange(visibleStartHour, visibleEndHour);
  const timelineHeight = hours.length * SLOT_HEIGHT;
  const nowTop = useMemo(() => {
    if (!sameLocalDay(now, date)) return null;
    const minutes = (now.getHours() - visibleStartHour) * 60 + now.getMinutes();
    return (minutes / 60) * SLOT_HEIGHT;
  }, [date, now, visibleStartHour]);

  useEffect(() => {
    if (!timelineRef.current || nowTop === null) return;
    const container = timelineRef.current;
    const targetTop = Math.max(0, nowTop - container.clientHeight * 0.3);
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [nowTop]);

  if (variant === "horizontal") {
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
            return (
              <Link
                key={`${item.kind}-${item.kind === "lesson" ? item.lesson.id : item.kind === "trial" ? item.trial.id : item.appointment.id}`}
                href={itemHref(item)}
                className={cn(
                  "flex shrink-0 flex-col rounded-xl border px-3 py-2 transition-colors",
                  item.kind === "lesson"
                    ? active
                      ? "border-primary bg-primary-soft"
                      : item.lesson.status === "in_progress"
                        ? LESSON_IN_PROGRESS_CARD
                        : "border-border bg-card hover:border-muted-foreground/40"
                    : item.kind === "trial"
                      ? "border-info/60 bg-info/5 hover:border-info"
                      : cn(
                          "border-dashed hover:brightness-95",
                          APPOINTMENT_TYPE_ACCENT[item.appointment.type],
                        ),
                )}
              >
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {timeFmt.format(new Date(item.starts_at))}
                </span>
                <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
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
      <div className="rounded-xl border border-border/60 bg-background/55 px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Vandaag
        </div>
        <div className="mt-1 text-sm font-semibold capitalize text-foreground">
          {dayFmt.format(date)}
        </div>
      </div>

      <div ref={timelineRef} className="relative mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/45 px-4 py-3 text-sm text-muted-foreground">
            Geen lessen vandaag. Tijd voor koffie.
          </div>
        ) : (
          <div className="relative" style={{ minHeight: timelineHeight }}>
            {nowTop !== null && nowTop >= 0 && nowTop <= timelineHeight ? (
              <div
                className="pointer-events-none absolute left-0 right-2 z-20"
                style={{ top: nowTop }}
              >
                <div className="relative">
                  <span
                    className="absolute left-[2.05rem] top-[-0.33rem] h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_rgba(124,92,255,0.18)]"
                    aria-hidden
                  />
                  <div className="ml-[2.35rem] h-px bg-primary/90" />
                </div>
              </div>
            ) : null}

            <ol className="space-y-1.5">
              {hours.map((hour) => {
                const slotItems = items.filter(
                  (item) => new Date(item.starts_at).getHours() === hour,
                );
                const currentHour = isCurrentHour(date, hour);
                return (
                  <li
                    key={hour}
                    className={cn(
                      "grid min-h-[74px] grid-cols-[3.1rem_minmax(0,1fr)] gap-2 rounded-[1rem] border px-2.5 py-2",
                      currentHour
                        ? "border-primary/35 bg-primary/8"
                        : "border-border/55 bg-background/38",
                    )}
                  >
                    <div className="pt-0.5">
                      <div
                        className={cn(
                          "text-[11px] font-semibold tabular-nums",
                          currentHour ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      {currentHour ? (
                        <div className="mt-1 inline-flex rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Nu
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {slotItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                          Vrij
                        </div>
                      ) : (
                        slotItems.map((item) => {
                          const id =
                            item.kind === "lesson"
                              ? item.lesson.id
                              : item.kind === "trial"
                                ? item.trial.id
                                : item.appointment.id;
                          const isActive = item.kind === "lesson" && item.lesson.id === selectedId;
                          return (
                            <Link
                              key={`${item.kind}-${id}`}
                              href={itemHref(item)}
                              className={cn(
                                "flex items-start gap-2.5 rounded-xl border px-3 py-2 transition-colors",
                                item.kind === "lesson"
                                  ? isActive
                                    ? "border-primary bg-primary-soft"
                                    : item.lesson.status === "in_progress"
                                      ? LESSON_IN_PROGRESS_CARD
                                      : "border-border bg-card hover:border-muted-foreground/40"
                                  : item.kind === "trial"
                                    ? "border-dashed border-info/60 bg-info/5 hover:border-info"
                                    : cn(
                                        "border-dashed hover:brightness-95",
                                        APPOINTMENT_TYPE_ACCENT[item.appointment.type],
                                      ),
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-[13px] font-semibold leading-5 text-foreground">
                                    {itemTitle(item, studentNames)}
                                  </p>
                                  {item.kind === "lesson" && item.lesson.status !== "planned" ? (
                                    <Badge
                                      variant={LESSON_STATUS_VARIANT[item.lesson.status]}
                                      className="shrink-0"
                                    >
                                      {LESSON_STATUS_LABEL[item.lesson.status]}
                                    </Badge>
                                  ) : null}
                                  {item.kind === "trial" ? (
                                    <Badge
                                      variant={TRIAL_LESSON_STATUS_VARIANT[item.trial.status]}
                                      className="shrink-0"
                                    >
                                      {TRIAL_LESSON_STATUS_LABEL[item.trial.status]}
                                    </Badge>
                                  ) : null}
                                  {item.kind === "appointment" ? (
                                    <Badge variant="default" className="shrink-0">
                                      {APPOINTMENT_TYPE_LABEL[item.appointment.type]}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {timeFmt.format(new Date(item.starts_at))} · {itemDuration(item)} min
                                </p>
                                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                  {itemSubtitle(item)}
                                </p>
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
