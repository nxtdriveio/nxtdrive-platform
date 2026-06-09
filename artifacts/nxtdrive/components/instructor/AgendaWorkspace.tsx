"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  GripVertical,
  Minus,
  Plus,
  Users2,
  X,
} from "lucide-react";
import { type AgendaAppointmentType, APPOINTMENT_VISIBILITY_LABEL, type AgendaVisibilityScope } from "@/lib/agenda/types";
import {
  moveOwnedAppointmentAction,
  moveOwnedLessonAction,
  setOwnedAppointmentColorAction,
} from "@/app/instructor/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PWACard } from "@/components/pwa/primitives";
import { cn } from "@/lib/utils";

export type InstructorAgendaView = "day" | "week" | "month";

type EventFilterKey = "lessons" | "exams" | "internal" | "trials";

type DayLayoutEvent = {
  event: InstructorAgendaEvent;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
  startsAt: Date;
  endsAt: Date;
};

type ResizeState = {
  id: string;
  kind: "lesson" | "appointment";
  edge: "start" | "end";
  dayDate: Date;
  startY: number;
  originStart: string;
  originEnd: string;
} | null;

type DraftWindow = {
  startsAt: string;
  endsAt: string;
};

export type InstructorAgendaEvent = {
  id: string;
  kind: "lesson" | "trial" | "appointment";
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  href: string;
  location: string | null;
  notes: string | null;
  badge: string;
  palette: "lesson" | "trial" | AgendaAppointmentType;
  colorOverride?: string | null;
  readOnly?: boolean;
  visibilityScope?: AgendaVisibilityScope;
  participantCount?: number;
  teamName?: string | null;
};

const VIEW_LABELS: Record<InstructorAgendaView, string> = {
  day: "Dag",
  week: "Week",
  month: "Maand",
};

const FILTER_LABELS: Record<EventFilterKey, string> = {
  lessons: "Lessen",
  exams: "Examens",
  internal: "Interne blokken",
  trials: "Proeflessen",
};

const MONTH_LABEL = new Intl.DateTimeFormat("nl-NL", {
  month: "long",
  year: "numeric",
});

const DAY_LABEL = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const LONG_DAY_LABEL = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const TIME_LABEL = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const COLOR_PRESETS = [
  "#7c5cff",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#ec4899",
] as const;

const ZOOM_LEVELS = [42, 56, 72] as const;
const SLOT_MINUTES = 30;
const NOW_LINE_WIDTH_REM = 1;
const MIN_EVENT_MINUTES = 30;

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function addMonths(date: Date, amount: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + amount);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  return value;
}

function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonthGrid(date: Date) {
  return addDays(startOfMonthGrid(addMonths(date, 1)), -1);
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function minutesBetween(start: string, end: string) {
  return Math.max(
    MIN_EVENT_MINUTES,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
  );
}

function buildHref(view: InstructorAgendaView, date: Date) {
  return `/instructor/week?view=${view}&date=${dayKey(date)}`;
}

function eventClasses(event: InstructorAgendaEvent) {
  if (event.colorOverride) {
    return {
      className: "text-foreground shadow-sm",
      style: {
        borderColor: event.colorOverride,
        backgroundColor: `${event.colorOverride}22`,
      } as CSSProperties,
    };
  }

  const paletteMap: Record<InstructorAgendaEvent["palette"], string> = {
    lesson: "border-primary/45 bg-primary/10 text-foreground",
    trial: "border-info/45 bg-info/10 text-foreground",
    exam: "border-danger/45 bg-danger/10 text-foreground",
    interim_test: "border-warning/45 bg-warning/10 text-foreground",
    theory_guidance: "border-info/45 bg-info/10 text-foreground",
    free_block: "border-border bg-muted/60 text-foreground",
    break: "border-border bg-muted/60 text-foreground",
    private_block: "border-border bg-muted/60 text-foreground",
    maintenance: "border-border bg-muted/60 text-foreground",
    admin: "border-border bg-muted/60 text-foreground",
    vacation: "border-border bg-muted/60 text-foreground",
  };

  return { className: paletteMap[event.palette], style: undefined };
}

function filterMatches(filter: EventFilterKey, event: InstructorAgendaEvent) {
  if (filter === "lessons") return event.kind === "lesson";
  if (filter === "trials") return event.kind === "trial";
  if (filter === "exams") {
    return event.palette === "exam" || event.palette === "interim_test";
  }
  return event.kind === "appointment" &&
    !["exam", "interim_test"].includes(event.palette);
}

function shouldShowEvent(event: InstructorAgendaEvent, filters: Record<EventFilterKey, boolean>) {
  return (Object.keys(filters) as EventFilterKey[]).some((filter) =>
    filters[filter] && filterMatches(filter, event)
  );
}

function snapMinutes(value: number) {
  return Math.round(value / SLOT_MINUTES) * SLOT_MINUTES;
}

function clampDraftWindow(
  draft: DraftWindow,
  dayDate: Date,
  visibleStartHour: number,
  visibleEndHour: number,
) {
  const dayStart = new Date(dayDate);
  dayStart.setHours(visibleStartHour, 0, 0, 0);
  const dayEnd = new Date(dayDate);
  dayEnd.setHours(visibleEndHour, 0, 0, 0);
  const start = new Date(Math.max(new Date(draft.startsAt).getTime(), dayStart.getTime()));
  const end = new Date(Math.min(new Date(draft.endsAt).getTime(), dayEnd.getTime()));
  if (end.getTime() - start.getTime() < MIN_EVENT_MINUTES * 60000) {
    end.setTime(start.getTime() + MIN_EVENT_MINUTES * 60000);
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function layoutDayEvents(
  events: InstructorAgendaEvent[],
  dayDate: Date,
  slotHeight: number,
  visibleStartHour: number,
  visibleEndHour: number,
  draftWindows: Map<string, DraftWindow>,
): DayLayoutEvent[] {
  const visibleStart = new Date(dayDate);
  visibleStart.setHours(visibleStartHour, 0, 0, 0);
  const visibleEnd = new Date(dayDate);
  visibleEnd.setHours(visibleEndHour, 0, 0, 0);

  const normalized = events
    .map((event) => {
      const draft = draftWindows.get(`${event.kind}-${event.id}`);
      const startsAt = new Date(draft?.startsAt ?? event.startsAt);
      const endsAt = new Date(draft?.endsAt ?? event.endsAt);
      if (endsAt <= visibleStart || startsAt >= visibleEnd) return null;

      const clippedStart = new Date(Math.max(startsAt.getTime(), visibleStart.getTime()));
      const clippedEnd = new Date(Math.min(endsAt.getTime(), visibleEnd.getTime()));
      const minutesFromTop =
        (clippedStart.getHours() - visibleStartHour) * 60 + clippedStart.getMinutes();
      const duration = Math.max(
        MIN_EVENT_MINUTES,
        Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60000),
      );

      return {
        event,
        startsAt,
        endsAt,
        top: (minutesFromTop / SLOT_MINUTES) * slotHeight + 4,
        height: Math.max((duration / SLOT_MINUTES) * slotHeight - 8, 42),
      };
    })
    .filter((value): value is {
      event: InstructorAgendaEvent;
      startsAt: Date;
      endsAt: Date;
      top: number;
      height: number;
    } => value !== null)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

  const laidOut: DayLayoutEvent[] = [];
  let cluster: typeof normalized = [];

  function flushCluster() {
    if (cluster.length === 0) return;
    const lanes: Array<{ end: number }> = [];
    const items = cluster.map((item) => {
      let laneIndex = lanes.findIndex((lane) => lane.end <= item.startsAt.getTime());
      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push({ end: item.endsAt.getTime() });
      } else {
        lanes[laneIndex] = { end: item.endsAt.getTime() };
      }
      return { ...item, laneIndex };
    });
    const laneCount = lanes.length;
    for (const item of items) {
      laidOut.push({
        event: item.event,
        top: item.top,
        height: item.height,
        laneIndex: item.laneIndex,
        laneCount,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      });
    }
    cluster = [];
  }

  for (const item of normalized) {
    if (cluster.length === 0) {
      cluster.push(item);
      continue;
    }

    const clusterEnd = Math.max(...cluster.map((entry) => entry.endsAt.getTime()));
    if (item.startsAt.getTime() < clusterEnd) {
      cluster.push(item);
      continue;
    }

    flushCluster();
    cluster.push(item);
  }

  flushCluster();
  return laidOut;
}

type DragState = {
  id: string;
  kind: "lesson" | "appointment";
} | null;

export function InstructorAgendaWorkspace({
  initialView,
  initialDate,
  events,
  visibleStartHour,
  visibleEndHour,
}: {
  initialView: InstructorAgendaView;
  initialDate: string;
  events: InstructorAgendaEvent[];
  visibleStartHour: number;
  visibleEndHour: number;
}) {
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = useState<InstructorAgendaEvent | null>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  const [resizeState, setResizeState] = useState<ResizeState>(null);
  const [draftWindows, setDraftWindows] = useState<Map<string, DraftWindow>>(new Map());
  const [localEvents, setLocalEvents] = useState(events);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const [filters, setFilters] = useState<Record<EventFilterKey, boolean>>({
    lessons: true,
    exams: true,
    internal: true,
    trials: true,
  });

  useEffect(() => {
    setLocalEvents(events);
  }, [events]);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!resizeState) return;
    const activeResize = resizeState;

    function onPointerMove(event: PointerEvent) {
      const draftKey = `${activeResize.kind}-${activeResize.id}`;
      const deltaMinutes = snapMinutes(((event.clientY - activeResize.startY) / ZOOM_LEVELS[zoomIndex]) * SLOT_MINUTES);
      const originStart = new Date(activeResize.originStart);
      const originEnd = new Date(activeResize.originEnd);

      const next = activeResize.edge === "start"
        ? {
            startsAt: new Date(originStart.getTime() + deltaMinutes * 60000).toISOString(),
            endsAt: originEnd.toISOString(),
          }
        : {
            startsAt: originStart.toISOString(),
            endsAt: new Date(originEnd.getTime() + deltaMinutes * 60000).toISOString(),
          };

      setDraftWindows((previous) => {
        const updated = new Map(previous);
        updated.set(
          draftKey,
          clampDraftWindow(next, activeResize.dayDate, visibleStartHour, visibleEndHour),
        );
        return updated;
      });
    }

    function onPointerUp() {
      const draftKey = `${activeResize.kind}-${activeResize.id}`;
      const draft = draftWindows.get(draftKey);
      if (draft) {
        startTransition(async () => {
          const result = activeResize.kind === "lesson"
            ? await moveOwnedLessonAction({
                lessonId: activeResize.id,
                startsAt: draft.startsAt,
                endsAt: draft.endsAt,
              })
            : await moveOwnedAppointmentAction({
                appointmentId: activeResize.id,
                startsAt: draft.startsAt,
                endsAt: draft.endsAt,
              });

          if (!result.error) {
            setLocalEvents((previous) =>
              previous.map((current) =>
                current.id === activeResize.id && current.kind === activeResize.kind
                  ? { ...current, startsAt: draft.startsAt, endsAt: draft.endsAt }
                  : current,
              ),
            );
          }
          setDraftWindows((previous) => {
            const updated = new Map(previous);
            updated.delete(draftKey);
            return updated;
          });
        });
      }
      setResizeState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draftWindows, resizeState, startTransition, visibleEndHour, visibleStartHour, zoomIndex]);

  const view = initialView;
  const anchor = parseIsoDate(initialDate);
  const slotHeight = ZOOM_LEVELS[zoomIndex] ?? ZOOM_LEVELS[1];

  const visibleDays = useMemo(() => {
    if (view === "day") return [startOfDay(anchor)];
    if (view === "week") {
      const weekStart = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    }
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchor, view]);

  const dayColumns = view === "month" ? [] : visibleDays;
  const totalSlots = (visibleEndHour - visibleStartHour) * 2;
  const timelineHeight = totalSlots * slotHeight;

  const filteredEvents = useMemo(
    () => localEvents.filter((event) => shouldShowEvent(event, filters)),
    [filters, localEvents],
  );

  const groupedByDay = useMemo(() => {
    const map = new Map<string, InstructorAgendaEvent[]>();
    for (const event of filteredEvents) {
      const key = dayKey(new Date(event.startsAt));
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    }
    return map;
  }, [filteredEvents]);

  const rangeLabel = useMemo(() => {
    if (view === "day") {
      return LONG_DAY_LABEL.format(anchor);
    }
    if (view === "week") {
      const start = visibleDays[0]!;
      const end = visibleDays[visibleDays.length - 1]!;
      return `${DAY_LABEL.format(start)} - ${DAY_LABEL.format(end)}`;
    }
    return MONTH_LABEL.format(anchor);
  }, [anchor, view, visibleDays]);

  function navigate(nextView: InstructorAgendaView, date: Date) {
    router.push(buildHref(nextView, date), { scroll: false });
  }

  function moveRange(direction: -1 | 1) {
    if (view === "day") {
      navigate(view, addDays(anchor, direction));
      return;
    }
    if (view === "week") {
      navigate(view, addDays(anchor, direction * 7));
      return;
    }
    navigate(view, addMonths(anchor, direction));
  }

  function jumpToToday() {
    navigate(view, new Date());
  }

  function handleDrop(targetDate: Date, slotIndex: number) {
    if (!dragging) return;
    const targetStart = new Date(targetDate);
    targetStart.setHours(
      visibleStartHour + Math.floor(slotIndex / 2),
      slotIndex % 2 === 0 ? 0 : 30,
      0,
      0,
    );

    const current = localEvents.find((event) => event.id === dragging.id && event.kind === dragging.kind);
    if (!current) return;

    const duration = minutesBetween(current.startsAt, current.endsAt);
    const targetEnd = new Date(targetStart.getTime() + duration * 60000);

    startTransition(async () => {
      const result =
        dragging.kind === "lesson"
          ? await moveOwnedLessonAction({
              lessonId: dragging.id,
              startsAt: targetStart.toISOString(),
              endsAt: targetEnd.toISOString(),
            })
          : await moveOwnedAppointmentAction({
              appointmentId: dragging.id,
              startsAt: targetStart.toISOString(),
              endsAt: targetEnd.toISOString(),
            });

      if (!result.error) {
        setLocalEvents((previous) =>
          previous.map((event) =>
            event.id === dragging.id && event.kind === dragging.kind
              ? {
                  ...event,
                  startsAt: targetStart.toISOString(),
                  endsAt: targetEnd.toISOString(),
                }
              : event,
          ),
        );
      }
      setDragging(null);
    });
  }

  function updateAppointmentColor(color: string | null) {
    if (!selectedEvent || selectedEvent.kind !== "appointment") return;
    startTransition(async () => {
      const result = await setOwnedAppointmentColorAction({
        appointmentId: selectedEvent.id,
        color,
      });
      if (!result.error) {
        setLocalEvents((previous) =>
          previous.map((event) =>
            event.kind === "appointment" && event.id === selectedEvent.id
              ? { ...event, colorOverride: color }
              : event,
          ),
        );
        setSelectedEvent((previous) =>
          previous ? { ...previous, colorOverride: color } : previous,
        );
      }
    });
  }

  return (
    <div className="space-y-5">
      <PWACard
        title="Agenda"
        className="bg-card"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-border/70 bg-background px-1 py-1">
              {(["day", "week", "month"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => navigate(candidate, anchor)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    candidate === view
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEW_LABELS[candidate]}
                </button>
              ))}
            </div>

            {view !== "month" ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-1 py-1">
                <button
                  type="button"
                  onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Uitzoomen"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomIndex((current) => Math.min(ZOOM_LEVELS.length - 1, current + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Inzoomen"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{rangeLabel}</p>
              <p className="text-xs text-muted-foreground">
                Sleep agenda-items, resize begin- en eindtijd en filter snel tussen lessen, examens en interne blokken.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => moveRange(-1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Vorige
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={jumpToToday}>
                Vandaag
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => moveRange(1)}>
                Volgende
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(FILTER_LABELS) as EventFilterKey[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() =>
                  setFilters((current) => ({ ...current, [filter]: !current[filter] }))
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  filters[filter]
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/70 bg-background text-muted-foreground",
                )}
              >
                {FILTER_LABELS[filter]}
              </button>
            ))}
          </div>

          {view === "month" ? (
            <MonthGrid
              anchor={anchor}
              days={visibleDays}
              eventsByDay={groupedByDay}
              onSelectEvent={setSelectedEvent}
            />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[72rem]">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `5.5rem repeat(${dayColumns.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="border-b border-border/70 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Tijd
                  </div>
                  {dayColumns.map((date) => (
                    <div
                      key={dayKey(date)}
                      className="border-b border-l border-border/70 px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {DAY_LABEL.format(date)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {LONG_DAY_LABEL.format(date)}
                      </p>
                    </div>
                  ))}

                  <div className="relative border-r border-border/70">
                    {Array.from({ length: totalSlots }, (_, slotIndex) => {
                      const hour = visibleStartHour + Math.floor(slotIndex / 2);
                      const minute = slotIndex % 2 === 0 ? "00" : "30";
                      return (
                        <div
                          key={slotIndex}
                          className="flex items-start border-b border-border/60 px-3 pt-2"
                          style={{ height: slotHeight }}
                        >
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden />
                            {String(hour).padStart(2, "0")}:{minute}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {dayColumns.map((date) => {
                    const key = dayKey(date);
                    const dayEvents = groupedByDay.get(key) ?? [];
                    const laidOutEvents = layoutDayEvents(
                      dayEvents,
                      date,
                      slotHeight,
                      visibleStartHour,
                      visibleEndHour,
                      draftWindows,
                    );
                    const isToday = sameDay(date, now);
                    const nowTop = isToday
                      ? (((now.getHours() - visibleStartHour) * 60 + now.getMinutes()) / SLOT_MINUTES) * slotHeight
                      : null;

                    return (
                      <div
                        key={key}
                        className="relative border-l border-border/70 bg-background/30"
                        style={{ height: timelineHeight }}
                      >
                        {Array.from({ length: totalSlots }, (_, slotIndex) => (
                          <div
                            key={`${key}-${slotIndex}`}
                            className="border-b border-border/60"
                            style={{ height: slotHeight }}
                            onDragOver={(event) => {
                              if (dragging) event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              handleDrop(date, slotIndex);
                            }}
                          />
                        ))}

                        {nowTop !== null && nowTop >= 0 && nowTop <= timelineHeight ? (
                          <div
                            className="pointer-events-none absolute left-0 right-0 z-20"
                            style={{ top: nowTop }}
                          >
                            <div className="relative">
                              <span
                                className="absolute -left-1 top-[-0.32rem] h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_rgba(124,92,255,0.18)]"
                                aria-hidden
                              />
                              <div className="h-px bg-primary/90" />
                            </div>
                          </div>
                        ) : null}

                        {laidOutEvents.map((layout) => {
                          const { className, style } = eventClasses(layout.event);
                          const gap = 8;
                          const laneWidth = `calc((100% - ${gap * 2}px) / ${layout.laneCount})`;
                          return (
                            <button
                              key={`${layout.event.kind}-${layout.event.id}`}
                              type="button"
                              draggable={!layout.event.readOnly}
                              onDragStart={() => {
                                if (layout.event.kind === "lesson" || layout.event.kind === "appointment") {
                                  setDragging({ id: layout.event.id, kind: layout.event.kind });
                                }
                              }}
                              onDragEnd={() => setDragging(null)}
                              onClick={() => setSelectedEvent(layout.event)}
                              className={cn(
                                "absolute rounded-2xl border px-3 py-2 text-left shadow-sm transition hover:shadow-md",
                                className,
                              )}
                              style={{
                                top: layout.top,
                                minHeight: 38,
                                height: layout.height,
                                width: laneWidth,
                                left: `calc(${gap}px + (${layout.laneIndex} * ${laneWidth}))`,
                                ...style,
                              }}
                            >
                              {!layout.event.readOnly && (layout.event.kind === "lesson" || layout.event.kind === "appointment") ? (
                                <>
                                  <span
                                    role="presentation"
                                    onPointerDown={(event) => {
                                      event.stopPropagation();
                                      const resizeKind = layout.event.kind === "lesson" ? "lesson" : "appointment";
                                      setResizeState({
                                        id: layout.event.id,
                                        kind: resizeKind,
                                        edge: "start",
                                        dayDate: date,
                                        startY: event.clientY,
                                        originStart: layout.event.startsAt,
                                        originEnd: layout.event.endsAt,
                                      });
                                    }}
                                    className="absolute inset-x-4 top-1 z-10 h-2 cursor-ns-resize rounded-full"
                                  />
                                  <span
                                    role="presentation"
                                    onPointerDown={(event) => {
                                      event.stopPropagation();
                                      const resizeKind = layout.event.kind === "lesson" ? "lesson" : "appointment";
                                      setResizeState({
                                        id: layout.event.id,
                                        kind: resizeKind,
                                        edge: "end",
                                        dayDate: date,
                                        startY: event.clientY,
                                        originStart: layout.event.startsAt,
                                        originEnd: layout.event.endsAt,
                                      });
                                    }}
                                    className="absolute inset-x-4 bottom-1 z-10 h-2 cursor-ns-resize rounded-full"
                                  />
                                </>
                              ) : null}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-foreground">
                                    {layout.event.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {TIME_LABEL.format(layout.startsAt)} - {TIME_LABEL.format(layout.endsAt)}
                                  </p>
                                </div>
                                {!layout.event.readOnly ? (
                                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                ) : null}
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {layout.event.subtitle}
                              </p>
                              {(layout.event.teamName || layout.event.participantCount) ? (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                                  {layout.event.teamName ? (
                                    <span className="rounded-full bg-black/10 px-2 py-0.5">
                                      {layout.event.teamName}
                                    </span>
                                  ) : null}
                                  {layout.event.participantCount ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5">
                                      <Users2 className="h-3 w-3" aria-hidden />
                                      +{layout.event.participantCount}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="info">Lessen</Badge>
            <Badge variant="warning">Examen / TTT</Badge>
            <Badge variant="outline">Interne blokken en privé</Badge>
            <Badge variant="success">Proeflessen</Badge>
            {pending ? <span>Agenda wordt bijgewerkt...</span> : null}
          </div>
        </div>
      </PWACard>

      {selectedEvent ? (
        <EventOverlay
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSetColor={updateAppointmentColor}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function MonthGrid({
  anchor,
  days,
  eventsByDay,
  onSelectEvent,
}: {
  anchor: Date;
  days: Date[];
  eventsByDay: Map<string, InstructorAgendaEvent[]>;
  onSelectEvent: (event: InstructorAgendaEvent) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {days.map((day) => {
        const key = dayKey(day);
        const events = eventsByDay.get(key) ?? [];
        const muted = day.getMonth() !== anchor.getMonth();
        return (
          <div
            key={key}
            className={cn(
              "min-h-44 rounded-2xl border border-border/70 bg-background/50 p-3",
              muted ? "opacity-60" : "",
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{day.getDate()}</p>
              {sameDay(day, new Date()) ? (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Vandaag
                </span>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                  Geen items
                </div>
              ) : (
                events.slice(0, 4).map((event) => {
                  const { className, style } = eventClasses(event);
                  return (
                    <button
                      key={`${event.kind}-${event.id}`}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left transition hover:shadow-sm",
                        className,
                      )}
                      style={style}
                    >
                      <p className="truncate text-xs font-semibold text-foreground">
                        {TIME_LABEL.format(new Date(event.startsAt))} · {event.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {event.badge}
                      </p>
                    </button>
                  );
                })
              )}
              {events.length > 4 ? (
                <div className="text-xs text-muted-foreground">
                  + {events.length - 4} extra afspraken
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventOverlay({
  event,
  onClose,
  onSetColor,
  pending,
}: {
  event: InstructorAgendaEvent;
  onClose: () => void;
  onSetColor: (color: string | null) => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Sluiten"
      />
      <div className="relative z-10 w-full max-w-xl rounded-[1.75rem] border border-border/80 bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Sluiten"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{event.badge}</Badge>
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {event.kind === "lesson"
                  ? "Les"
                  : event.kind === "trial"
                    ? "Proefles"
                    : "Afspraak"}
              </span>
              {event.visibilityScope ? (
                <Badge variant="default">{APPOINTMENT_VISIBILITY_LABEL[event.visibilityScope]}</Badge>
              ) : null}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">{event.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{event.subtitle}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Start" value={new Date(event.startsAt).toLocaleString("nl-NL")} />
            <InfoRow label="Einde" value={new Date(event.endsAt).toLocaleString("nl-NL")} />
            <InfoRow label="Locatie" value={event.location ?? "Geen locatie"} />
            <InfoRow
              label="Duur"
              value={`${minutesBetween(event.startsAt, event.endsAt)} minuten`}
            />
          </div>

          {event.teamName || event.participantCount ? (
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Samenwerking
              </p>
              <p className="mt-2 text-sm text-foreground">
                {event.teamName ? `Team: ${event.teamName}` : "Geen team gekoppeld"}
              </p>
              {event.participantCount ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.participantCount} extra medewerker(s) gekoppeld.
                </p>
              ) : null}
            </div>
          ) : null}

          {event.notes ? (
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Notities
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">{event.notes}</p>
            </div>
          ) : null}

          {event.kind === "appointment" ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="text-sm font-semibold text-foreground">Kleur in agenda</p>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onSetColor(color)}
                    className="h-9 w-9 rounded-full border border-border shadow-sm transition hover:scale-105"
                    style={{ backgroundColor: color }}
                    aria-label={`Kies kleur ${color}`}
                    disabled={pending}
                  />
                ))}
                <input
                  type="color"
                  value={event.colorOverride ?? "#7c5cff"}
                  onChange={(input) => onSetColor(input.target.value)}
                  className="h-9 w-14 rounded-xl border border-border bg-background p-1"
                  disabled={pending}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onSetColor(null)}
                  disabled={pending}
                >
                  Standaardkleur
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Standaard afspraaktypes houden automatisch hun eigen kleur. Met een kleur hier overschrijf je die voor dit specifieke item.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {event.readOnly
                ? "Dit item is hier alleen leesbaar."
                : "Je kunt dit item in dag- en weekweergave naar een nieuw tijdslot slepen of verticaal resizen."}
            </p>
            <Link
              href={event.href}
              className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Open detail
              <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}
