"use client";

import Link from "next/link";
import { AlertTriangle, CarFront, CloudOff } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import {
  createNlDateTimeFormatter,
  zonedMinuteOfDay,
  zonedYmd,
} from "@/lib/datetime";
import type { InstructorAgendaPeriod } from "@/lib/instructor/agenda-period";
import { cn } from "@/lib/utils";
import type { InstructorAgendaCreateOptions } from "../../application/instructor-agenda-create-options";
import {
  CALENDAR_SLOT_MINUTES,
  MINUTES_PER_DAY_VIEW,
  currentTimeMinutes,
  formatMinuteOffset,
  initialScrollMinutes,
  layoutOverlappingEvents,
  minutesFromPointerPosition,
  pixelsFromMinutes,
  snapMinutesToCreatableSlot,
  visibleCalendarInterval,
  type InstructorDayAgendaItem,
  type InstructorDayCalendarType,
  type VisibleCalendarInterval,
} from "../../domain/instructor-day-calendar";
import {
  AppointmentCreateSheet,
  AppointmentQuickView,
} from "./AppointmentSheets";
import { CalendarEventBlock } from "./CalendarEventBlock";
import { DayCalendarHeader } from "./DayCalendarHeader";

function useHourHeight(): number {
  const [height, setHeight] = useState(76);
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      setHeight(width <= 430 ? 70 : width <= 1194 ? 76 : 80);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

function dateFromYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function timelineHref(basePath: string, mode: string, date: string): string {
  const params = new URLSearchParams({ weergave: mode, datum: date });
  return `${basePath}?${params.toString()}`;
}

function calendarAnalytics(
  name: string,
  detail: Record<string, string | number> = {},
) {
  window.dispatchEvent(
    new CustomEvent("nxtdrive:analytics", { detail: { name, ...detail } }),
  );
}

function TravelGapIndicator({
  item,
  top,
}: {
  item: InstructorDayAgendaItem;
  top: number;
}) {
  const gap = item.travelFromPrevious;
  if (!gap || gap.status === "UNKNOWN") return null;
  const warning = gap.status === "TIGHT" || gap.status === "INFEASIBLE";
  const duration =
    gap.durationMinutes === undefined
      ? "Reistijd onbekend"
      : `${gap.durationMinutes} min`;
  const available =
    gap.availableMinutes === undefined
      ? ""
      : ` · ${gap.availableMinutes} min vrij`;
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-2 z-10 flex max-w-[70%] items-center gap-1 rounded-full border bg-card/94 px-2 py-1 text-[9px] font-black shadow-sm backdrop-blur sm:text-[10px]",
        warning
          ? "border-amber-300 text-amber-900"
          : "border-brand-border text-muted-foreground",
      )}
      style={{ top: Math.max(2, top - 22) }}
      aria-label={`Reistijd vanaf vorige afspraak: ${duration}${available}`}
    >
      {warning ? (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <CarFront className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">
        {duration}
        {available}
      </span>
    </div>
  );
}

export function InstructorDayCalendar({
  period,
  items,
  timeZone,
  initialNowIso,
  selectedAppointmentId,
  selectionBasePath = "/instructeur/agenda",
  createOptions,
  createAction,
}: {
  period: InstructorAgendaPeriod;
  items: readonly InstructorDayAgendaItem[];
  timeZone: string;
  initialNowIso: string;
  selectedAppointmentId?: string;
  selectionBasePath?: string;
  createOptions?: InstructorAgendaCreateOptions;
  createAction?: (formData: FormData) => void | Promise<void>;
}) {
  const hourHeight = useHourHeight();
  const timelineHeight = pixelsFromMinutes(MINUTES_PER_DAY_VIEW, hourHeight);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<number, HTMLButtonElement>());
  const initialScrollDateRef = useRef<string | null>(null);
  const initialNow = useMemo(() => new Date(initialNowIso), [initialNowIso]);
  const [now, setNow] = useState(initialNow);
  const [offline, setOffline] = useState(false);
  const [quickAddMinute, setQuickAddMinute] = useState(9 * 60);
  const [focusedSlot, setFocusedSlot] = useState(9 * 60);
  const [createType, setCreateType] =
    useState<InstructorDayCalendarType | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [selectedItem, setSelectedItem] =
    useState<InstructorDayAgendaItem | null>(
      () => items.find((item) => item.id === selectedAppointmentId) ?? null,
    );

  const dateFormatter = useMemo(
    () =>
      createNlDateTimeFormatter(
        { weekday: "long", day: "numeric", month: "long" },
        "UTC",
      ),
    [],
  );
  const timeFormatter = useMemo(
    () =>
      createNlDateTimeFormatter(
        { hour: "2-digit", minute: "2-digit" },
        timeZone,
      ),
    [timeZone],
  );
  const selectedDateLabel = dateFormatter.format(
    dateFromYmd(period.selectedDate),
  );

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const timer = window.setInterval(updateNow, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") updateNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const updateNetwork = () => setOffline(!navigator.onLine);
    updateNetwork();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  const intervals = useMemo(() => {
    const map = new Map<string, VisibleCalendarInterval>();
    for (const item of items) {
      const interval = visibleCalendarInterval(
        item,
        period.selectedDate,
        timeZone,
      );
      if (interval) map.set(item.id, interval);
    }
    return map;
  }, [items, period.selectedDate, timeZone]);

  const visibleItems = useMemo(
    () => items.filter((item) => intervals.has(item.id)),
    [intervals, items],
  );
  const layouts = useMemo(
    () =>
      layoutOverlappingEvents(visibleItems, (item) => {
        const interval = intervals.get(item.id);
        return interval
          ? { start: interval.startMinutes, end: interval.endMinutes }
          : null;
      }),
    [intervals, visibleItems],
  );

  const currentMinute = currentTimeMinutes({
    selectedDate: period.selectedDate,
    now,
    timeZone,
  });

  const slotMinutes = useMemo(
    () =>
      Array.from(
        { length: MINUTES_PER_DAY_VIEW / CALENDAR_SLOT_MINUTES },
        (_, index) => index * CALENDAR_SLOT_MINUTES,
      ),
    [],
  );
  const occupiedSlots = useMemo(() => {
    const occupied = new Set<number>();
    for (const minute of slotMinutes) {
      if (
        [...intervals.values()].some(
          (interval) =>
            minute < interval.endMinutes &&
            minute + CALENDAR_SLOT_MINUTES > interval.startMinutes,
        )
      ) {
        occupied.add(minute);
      }
    }
    return occupied;
  }, [intervals, slotMinutes]);
  const availableSlots = useMemo(
    () => slotMinutes.filter((minute) => !occupiedSlots.has(minute)),
    [occupiedSlots, slotMinutes],
  );

  const openQuickAdd = useCallback(
    (minute: number) => {
      const snapped = snapMinutesToCreatableSlot(minute);
      if (occupiedSlots.has(snapped)) return;
      setQuickAddMinute(snapped);
      setFocusedSlot(snapped);
      setCreateType("lesson");
      setCreateSheetOpen(true);
      calendarAnalytics("calendar_quick_add_opened", {
        minute: snapped,
      });
    },
    [occupiedSlots],
  );

  const openUsefulQuickAdd = useCallback(() => {
    const preferred =
      currentMinute === null
        ? 9 * 60
        : snapMinutesToCreatableSlot(currentMinute + CALENDAR_SLOT_MINUTES);
    const next =
      availableSlots.find((minute) => minute >= preferred) ??
      availableSlots[0] ??
      preferred;
    openQuickAdd(next);
  }, [availableSlots, currentMinute, openQuickAdd]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || initialScrollDateRef.current === period.selectedDate)
      return;
    const firstVisible = Math.min(
      ...visibleItems.map((item) => intervals.get(item.id)?.startMinutes ?? 0),
    );
    const targetMinutes = initialScrollMinutes({
      selectedDate: period.selectedDate,
      today: period.todayYmd,
      nowMinuteOfDay: zonedMinuteOfDay(initialNow, timeZone),
      firstVisibleEventMinute: Number.isFinite(firstVisible)
        ? firstVisible
        : null,
    });
    const targetScrollTop = Math.max(
      0,
      pixelsFromMinutes(targetMinutes, hourHeight) - 12,
    );
    const applyInitialScroll = () => {
      scroller.scrollTop = targetScrollTop;
      initialScrollDateRef.current = period.selectedDate;
    };
    const timer = window.setTimeout(applyInitialScroll, 120);
    // Next.js may restore the nested viewport once after hydration. Retry only
    // when that one-off restoration put the untouched calendar back at zero.
    const hydrationSettleTimer = window.setTimeout(() => {
      if (targetScrollTop > 0 && scroller.scrollTop === 0) {
        applyInitialScroll();
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hydrationSettleTimer);
    };
  }, [
    hourHeight,
    initialNow,
    intervals,
    period.selectedDate,
    period.todayYmd,
    timeZone,
    visibleItems,
  ]);

  useEffect(() => {
    calendarAnalytics("instructor_day_calendar_opened", {
      appointment_count: items.length,
    });
  }, [items.length, period.selectedDate]);

  function moveSlotFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    minute: number,
  ) {
    const delta =
      event.key === "ArrowDown"
        ? 15
        : event.key === "ArrowUp"
          ? -15
          : event.key === "ArrowRight"
            ? 60
            : event.key === "ArrowLeft"
              ? -60
              : 0;
    if (!delta) return;
    event.preventDefault();
    const lastSlot = MINUTES_PER_DAY_VIEW - CALENDAR_SLOT_MINUTES;
    let candidate = Math.max(0, Math.min(lastSlot, minute + delta));
    const direction = delta > 0 ? 15 : -15;
    while (
      occupiedSlots.has(candidate) &&
      candidate >= 0 &&
      candidate <= lastSlot
    ) {
      candidate += direction;
    }
    candidate = Math.max(0, Math.min(lastSlot, candidate));
    if (occupiedSlots.has(candidate)) return;
    setFocusedSlot(candidate);
    slotRefs.current.get(candidate)?.focus();
  }

  function openFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    openQuickAdd(
      minutesFromPointerPosition(event.clientY - rect.top, hourHeight),
    );
  }

  const selectedTime = formatMinuteOffset(quickAddMinute);
  const redirectTo = timelineHref(
    "/instructeur/agenda",
    "day",
    period.selectedDate,
  );
  const selectedItemTime = selectedItem
    ? `${timeFormatter.format(new Date(selectedItem.startsAt))}–${timeFormatter.format(
        new Date(selectedItem.endsAt),
      )}`
    : "";

  return (
    <section
      data-instructor-day-calendar=""
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.35rem] border border-brand-border/80 bg-card/94 shadow-brand-card backdrop-blur"
    >
      <DayCalendarHeader
        period={period}
        basePath={selectionBasePath}
        onQuickAdd={openUsefulQuickAdd}
      />

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-brand-border/65 bg-brand-muted/25 px-3 py-1.5 sm:px-4">
        <nav
          className="flex min-w-0 items-center gap-1"
          aria-label="Agendaweergave"
        >
          {(["day", "week", "month"] as const).map((mode) => (
            <Link
              key={mode}
              href={timelineHref(selectionBasePath, mode, period.selectedDate)}
              aria-current={mode === "day" ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                mode === "day"
                  ? "bg-card text-brand-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "day" ? "Dag" : mode === "week" ? "Week" : "Maand"}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {offline ? (
            <Badge variant="warning">
              <CloudOff className="mr-1 h-3 w-3" aria-hidden />
              Offline
            </Badge>
          ) : null}
          <Link
            href={timelineHref(
              selectionBasePath,
              "history",
              period.selectedDate,
            )}
            className="hidden min-h-10 items-center rounded-xl px-2 text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring sm:inline-flex"
          >
            Historie
          </Link>
        </div>
      </div>

      <div
        ref={scrollRef}
        data-calendar-scroll-viewport=""
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand-muted)_18%,transparent),transparent_7rem)] [scrollbar-gutter:stable]"
      >
        <div
          className="relative min-w-0"
          style={
            {
              height: timelineHeight,
              "--calendar-hour-height": `${hourHeight}px`,
            } as CSSProperties
          }
        >
          <div
            className="absolute inset-y-0 left-0 w-[3.35rem] bg-card/72 sm:w-16"
            aria-hidden
          />
          {Array.from(
            { length: MINUTES_PER_DAY_VIEW / CALENDAR_SLOT_MINUTES + 1 },
            (_, index) => index * CALENDAR_SLOT_MINUTES,
          ).map((minute) => {
            const fullHour = minute % 60 === 0;
            const halfHour = minute % 30 === 0 && !fullHour;
            return (
              <div
                key={minute}
                data-calendar-grid-line={
                  fullHour ? "hour" : halfHour ? "half-hour" : "quarter-hour"
                }
                className="pointer-events-none absolute inset-x-0 z-0"
                style={{ top: pixelsFromMinutes(minute, hourHeight) }}
                aria-hidden
              >
                {fullHour ? (
                  <span className="absolute left-1 top-0 w-12 -translate-y-1/2 bg-card/80 pr-1 text-right text-[10px] font-bold tabular-nums text-muted-foreground sm:left-2 sm:w-12 sm:text-[11px]">
                    {formatMinuteOffset(minute)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "absolute left-[3.35rem] right-0 top-0 border-t sm:left-16",
                    fullHour
                      ? "border-solid border-slate-300/60 dark:border-slate-600/65"
                      : halfHour
                        ? "border-dashed border-slate-300/45 dark:border-slate-600/45"
                        : "border-dotted border-slate-300/30 dark:border-slate-600/30",
                  )}
                />
              </div>
            );
          })}

          <div
            ref={contentRef}
            role="grid"
            aria-label={`Dagagenda ${selectedDateLabel}, van 00:00 tot 24:00`}
            aria-rowcount={slotMinutes.length}
            className="absolute inset-y-0 left-[3.35rem] right-0 overflow-hidden sm:left-16"
            onPointerUp={openFromPointer}
          >
            {slotMinutes.map((minute, index) => {
              const occupied = occupiedSlots.has(minute);
              return (
                <button
                  key={minute}
                  ref={(element) => {
                    if (element) slotRefs.current.set(minute, element);
                    else slotRefs.current.delete(minute);
                  }}
                  type="button"
                  role="gridcell"
                  aria-rowindex={index + 1}
                  aria-label={`Nieuwe afspraak toevoegen, ${selectedDateLabel}, ${formatMinuteOffset(minute)}`}
                  disabled={occupied}
                  tabIndex={!occupied && minute === focusedSlot ? 0 : -1}
                  onFocus={() => setFocusedSlot(minute)}
                  onKeyDown={(event) => moveSlotFocus(event, minute)}
                  onClick={() => openQuickAdd(minute)}
                  className="absolute inset-x-0 z-[1] cursor-pointer border-0 bg-transparent outline-none transition-colors hover:bg-brand-accent/22 focus-visible:z-10 focus-visible:bg-brand-accent/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring disabled:pointer-events-none motion-reduce:transition-none"
                  style={{
                    top: pixelsFromMinutes(minute, hourHeight),
                    height: pixelsFromMinutes(
                      CALENDAR_SLOT_MINUTES,
                      hourHeight,
                    ),
                  }}
                />
              );
            })}

            {visibleItems.length === 0 ? (
              <div className="pointer-events-none absolute left-3 right-3 top-4 z-[2] rounded-2xl border border-dashed border-brand-border/80 bg-card/86 p-3 text-center backdrop-blur sm:left-6 sm:right-6">
                <p className="text-sm font-black text-foreground">
                  Nog geen afspraken{" "}
                  {period.selectedDate === period.todayYmd
                    ? "vandaag"
                    : "deze dag"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tik op een tijdstip om iets toe te voegen.
                </p>
              </div>
            ) : null}

            {layouts.map((layout) => {
              const interval = intervals.get(layout.event.id);
              if (!interval) return null;
              const startAt = new Date(layout.event.startsAt);
              const endAt = new Date(layout.event.endsAt);
              const isCurrent =
                zonedYmd(now, timeZone) === period.selectedDate &&
                now >= startAt &&
                now < endAt;
              return (
                <div key={layout.event.id} className="contents">
                  <TravelGapIndicator
                    item={layout.event}
                    top={pixelsFromMinutes(interval.startMinutes, hourHeight)}
                  />
                  <CalendarEventBlock
                    layout={layout}
                    interval={interval}
                    top={pixelsFromMinutes(interval.startMinutes, hourHeight)}
                    height={pixelsFromMinutes(
                      interval.durationMinutes,
                      hourHeight,
                    )}
                    timeLabel={`${timeFormatter.format(startAt)}–${timeFormatter.format(endAt)}`}
                    dateLabel={selectedDateLabel}
                    isCurrent={isCurrent}
                    isPast={
                      endAt <= now && period.selectedDate === period.todayYmd
                    }
                    onOpen={(item) => {
                      setSelectedItem(item);
                      calendarAnalytics("appointment_opened", {
                        appointment_type: item.type,
                      });
                    }}
                  />
                </div>
              );
            })}

            {currentMinute !== null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                style={{ top: pixelsFromMinutes(currentMinute, hourHeight) }}
                role="status"
                aria-label={`Huidige tijd ${formatMinuteOffset(currentMinute)}`}
                data-current-time-indicator=""
              >
                <span className="-ml-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-primary ring-2 ring-card" />
                <span className="ml-1 rounded-full bg-brand-primary px-1.5 py-0.5 text-[9px] font-black tabular-nums text-white shadow-sm">
                  {formatMinuteOffset(currentMinute)}
                </span>
                <span className="h-0.5 flex-1 bg-brand-primary/80" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {offline
          ? "Offline. Nieuwe afspraken zijn tijdelijk uitgeschakeld."
          : ""}
      </div>

      <AppointmentCreateSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        type={createType}
        selectedDate={period.selectedDate}
        selectedTime={selectedTime}
        options={createOptions}
        redirectTo={redirectTo}
        offline={offline}
        createAction={createAction}
      />
      <AppointmentQuickView
        item={selectedItem}
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
        dateLabel={selectedDateLabel}
        timeLabel={selectedItemTime}
      />
    </section>
  );
}
