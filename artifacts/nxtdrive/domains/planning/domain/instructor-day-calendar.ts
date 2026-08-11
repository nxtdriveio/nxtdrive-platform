import { zonedMinuteOfDay, zonedYmd } from "@/lib/datetime";

export const CALENDAR_START_HOUR = 7;
export const CALENDAR_END_HOUR = 22;
export const MINUTES_PER_DAY_VIEW =
  (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;
export const CALENDAR_SLOT_MINUTES = 15;
export const DEFAULT_HOUR_HEIGHT = 76;

export type InstructorDayCalendarType =
  | "lesson"
  | "trial"
  | "exam"
  | "interim_test"
  | "theory_guidance"
  | "free_block"
  | "break"
  | "private_block"
  | "maintenance"
  | "admin"
  | "vacation";

export type TravelGapStatus =
  | "UNKNOWN"
  | "AMPLE"
  | "TIGHT"
  | "INFEASIBLE"
  | "FALLBACK";

export type InstructorDayAgendaItem = Readonly<{
  id: string;
  kind: "lesson" | "trial" | "appointment";
  type: InstructorDayCalendarType;
  startsAt: string;
  endsAt: string;
  status: string;
  title: string;
  participantLabel?: string;
  location?: {
    label?: string;
    formattedAddress?: string;
  };
  vehicle?: {
    displayName: string;
  };
  href: string;
  evaluationHref?: string;
  travelFromPrevious?: {
    durationMinutes?: number;
    availableMinutes?: number;
    status: TravelGapStatus;
    asOf?: string;
    method?: string;
  };
  permissions: {
    canOpen: boolean;
    canEdit: boolean;
    canCancel: boolean;
    canStartLesson: boolean;
    canNavigate: boolean;
  };
}>;

export type VisibleCalendarInterval = Readonly<{
  startsBeforeWindow: boolean;
  endsAfterWindow: boolean;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}>;

export type CalendarEventLayout<T extends { id: string }> = Readonly<{
  event: T;
  column: number;
  columnCount: number;
  columnSpan: number;
}>;

export function minutesSinceStart(
  dateTime: Date | string,
  timeZone: string,
): number {
  const value = dateTime instanceof Date ? dateTime : new Date(dateTime);
  return zonedMinuteOfDay(value, timeZone) - CALENDAR_START_HOUR * 60;
}

export function pixelsFromMinutes(
  minutes: number,
  hourHeight = DEFAULT_HOUR_HEIGHT,
): number {
  return (minutes / 60) * hourHeight;
}

export function minutesFromPointerPosition(
  y: number,
  hourHeight = DEFAULT_HOUR_HEIGHT,
): number {
  if (!Number.isFinite(y)) return 0;
  return Math.max(0, Math.min(MINUTES_PER_DAY_VIEW - 1, (y / hourHeight) * 60));
}

export function snapMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY_VIEW, minutes));
  return Math.round(clamped / CALENDAR_SLOT_MINUTES) * CALENDAR_SLOT_MINUTES;
}

export function snapMinutesToCreatableSlot(minutes: number): number {
  return Math.min(
    MINUTES_PER_DAY_VIEW - CALENDAR_SLOT_MINUTES,
    snapMinutes(minutes),
  );
}

function relativeMinuteForDay(
  dateTime: string,
  selectedDate: string,
  timeZone: string,
): number {
  const instant = new Date(dateTime);
  const dateYmd = zonedYmd(instant, timeZone);
  const minute = zonedMinuteOfDay(instant, timeZone);
  if (dateYmd < selectedDate) return minute - 24 * 60;
  if (dateYmd > selectedDate) return minute + 24 * 60;
  return minute;
}

export function visibleCalendarInterval(
  item: Pick<InstructorDayAgendaItem, "startsAt" | "endsAt">,
  selectedDate: string,
  timeZone: string,
): VisibleCalendarInterval | null {
  const windowStart = CALENDAR_START_HOUR * 60;
  const windowEnd = CALENDAR_END_HOUR * 60;
  const rawStart = relativeMinuteForDay(item.startsAt, selectedDate, timeZone);
  const rawEnd = relativeMinuteForDay(item.endsAt, selectedDate, timeZone);
  if (rawEnd <= windowStart || rawStart >= windowEnd || rawEnd <= rawStart) {
    return null;
  }
  const visibleStart = Math.max(windowStart, rawStart);
  const visibleEnd = Math.min(windowEnd, rawEnd);
  return {
    startsBeforeWindow: rawStart < windowStart,
    endsAfterWindow: rawEnd > windowEnd,
    startMinutes: visibleStart - windowStart,
    endMinutes: visibleEnd - windowStart,
    durationMinutes: visibleEnd - visibleStart,
  };
}

type OverlapCandidate<T extends { id: string }> = {
  event: T;
  start: number;
  end: number;
  column?: number;
};

function candidatesOverlap<T extends { id: string }>(
  left: OverlapCandidate<T>,
  right: OverlapCandidate<T>,
): boolean {
  return left.start < right.end && right.start < left.end;
}

function layoutOverlapGroup<T extends { id: string }>(
  group: OverlapCandidate<T>[],
): CalendarEventLayout<T>[] {
  const columnEnds: number[] = [];
  for (const candidate of group) {
    let column = columnEnds.findIndex((end) => end <= candidate.start);
    if (column === -1) column = columnEnds.length;
    candidate.column = column;
    columnEnds[column] = candidate.end;
  }

  const columnCount = columnEnds.length;
  return group.map((candidate) => {
    const column = candidate.column ?? 0;
    let columnSpan = 1;
    for (
      let nextColumn = column + 1;
      nextColumn < columnCount;
      nextColumn += 1
    ) {
      const blocked = group.some(
        (other) =>
          other.column === nextColumn && candidatesOverlap(candidate, other),
      );
      if (blocked) break;
      columnSpan += 1;
    }
    return {
      event: candidate.event,
      column,
      columnCount,
      columnSpan,
    };
  });
}

export function layoutOverlappingEvents<T extends { id: string }>(
  events: readonly T[],
  intervalFor: (event: T) => { start: number; end: number } | null,
): CalendarEventLayout<T>[] {
  const candidates = events
    .flatMap((event): OverlapCandidate<T>[] => {
      const interval = intervalFor(event);
      if (!interval || interval.end <= interval.start) return [];
      return [{ event, start: interval.start, end: interval.end }];
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        right.end - left.end ||
        left.event.id.localeCompare(right.event.id),
    );

  const result: CalendarEventLayout<T>[] = [];
  let group: OverlapCandidate<T>[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;
  const flush = () => {
    if (group.length > 0) result.push(...layoutOverlapGroup(group));
    group = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  };

  for (const candidate of candidates) {
    if (group.length > 0 && candidate.start >= groupEnd) flush();
    group.push(candidate);
    groupEnd = Math.max(groupEnd, candidate.end);
  }
  flush();
  return result;
}

export function currentTimeMinutes(input: {
  selectedDate: string;
  now: Date;
  timeZone: string;
}): number | null {
  if (zonedYmd(input.now, input.timeZone) !== input.selectedDate) return null;
  const minutes = minutesSinceStart(input.now, input.timeZone);
  return minutes >= 0 && minutes < MINUTES_PER_DAY_VIEW ? minutes : null;
}

export function initialScrollMinutes(input: {
  selectedDate: string;
  today: string;
  nowMinuteOfDay: number;
  firstVisibleEventMinute?: number | null;
}): number {
  if (input.selectedDate === input.today) {
    if (input.nowMinuteOfDay < CALENDAR_START_HOUR * 60) return 0;
    if (input.nowMinuteOfDay >= CALENDAR_END_HOUR * 60) {
      return (18 - CALENDAR_START_HOUR) * 60;
    }
    return Math.max(0, input.nowMinuteOfDay - CALENDAR_START_HOUR * 60 - 60);
  }
  return Math.max(0, (input.firstVisibleEventMinute ?? 60) - 60);
}

export function formatMinuteOffset(minutes: number): string {
  const minuteOfDay = CALENDAR_START_HOUR * 60 + minutes;
  const hours = Math.floor(minuteOfDay / 60);
  const rest = Math.floor(minuteOfDay % 60);
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
