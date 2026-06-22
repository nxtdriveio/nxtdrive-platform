// ---------------------------------------------------------------------------
// Pure availability computation. No I/O — fully unit-testable.
//
// Resolves the recurring weekly schedule + date exceptions into the concrete
// FREE intervals (minutes from midnight) for a given calendar day. This is the
// "free space" the agenda renders as background.
// ---------------------------------------------------------------------------

import type {
  AvailabilityException,
  Interval,
  WeeklyAvailability,
} from "@/lib/availability/types";
import {
  addDaysYmd,
  startOfZonedDayUtc,
  zonedYmd,
} from "@/lib/datetime";

// Merge overlapping/adjacent intervals into a minimal sorted set.
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start_min - b.start_min);
  const out: Interval[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start_min <= last.end_min) {
      last.end_min = Math.max(last.end_min, cur.end_min);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

// Subtract `holes` from `base`, returning the remaining intervals.
export function subtractIntervals(
  base: Interval[],
  holes: Interval[],
): Interval[] {
  if (holes.length === 0) return mergeIntervals(base);
  const merged = mergeIntervals(base);
  const cuts = mergeIntervals(holes);
  const out: Interval[] = [];
  for (const seg of merged) {
    let segments: Interval[] = [{ ...seg }];
    for (const hole of cuts) {
      const next: Interval[] = [];
      for (const s of segments) {
        // No overlap.
        if (hole.end_min <= s.start_min || hole.start_min >= s.end_min) {
          next.push(s);
          continue;
        }
        // Left remainder.
        if (hole.start_min > s.start_min) {
          next.push({ start_min: s.start_min, end_min: hole.start_min });
        }
        // Right remainder.
        if (hole.end_min < s.end_min) {
          next.push({ start_min: hole.end_min, end_min: s.end_min });
        }
      }
      segments = next;
    }
    out.push(...segments);
  }
  return out.filter((iv) => iv.end_min > iv.start_min);
}

const WHOLE_DAY: Interval = { start_min: 0, end_min: 1440 };

function excToInterval(exc: AvailabilityException): Interval {
  return {
    start_min: exc.start_min ?? WHOLE_DAY.start_min,
    end_min: exc.end_min ?? WHOLE_DAY.end_min,
  };
}

// Compute one instructor's free intervals for a single day, given:
//   - weekdayBlocks: that instructor's recurring blocks for the day's weekday
//   - dayExceptions: that instructor's exceptions on that exact date
//
// Order of resolution: weekly base ∪ 'available' exceptions, then minus
// 'blocked' exceptions.
export function computeFreeIntervals(
  weekdayBlocks: WeeklyAvailability[],
  dayExceptions: AvailabilityException[],
): Interval[] {
  const base: Interval[] = weekdayBlocks.map((b) => ({
    start_min: b.start_min,
    end_min: b.end_min,
  }));
  const extra = dayExceptions
    .filter((e) => e.kind === "available")
    .map(excToInterval);
  const blocked = dayExceptions
    .filter((e) => e.kind === "blocked")
    .map(excToInterval);

  const available = mergeIntervals([...base, ...extra]);
  return subtractIntervals(available, blocked);
}

// JS getUTCDay() weekday (0=Sun..6=Sat) for a YYYY-MM-DD date key.
export function weekdayForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

// Calendar date key (YYYY-MM-DD) in the tenant timezone. Agenda day cards and
// availability exceptions both use this key, avoiding off-by-one-day drift on
// UTC servers and around DST boundaries.
export function dateKey(d: Date, timeZone?: string | null): string {
  return zonedYmd(d, timeZone ?? undefined);
}

export function dateKeysInRange(
  from: Date,
  to: Date,
  timeZone?: string | null,
): string[] {
  const keys: string[] = [];
  for (
    let key = dateKey(from, timeZone);
    startOfZonedDayUtc(key, timeZone ?? undefined) < to;
    key = addDaysYmd(key, 1)
  ) {
    keys.push(key);
  }
  return keys;
}

// Merge free intervals across MANY instructors for a single day (the union of
// "someone is available"). Used by the backoffice agenda which is not scoped to
// one instructor.
export function computeDayFreeSpace(
  key: string,
  weeklyByInstructor: Map<string, WeeklyAvailability[]>,
  exceptionsByInstructorDate: Map<string, AvailabilityException[]>,
): Interval[] {
  const weekday = weekdayForDateKey(key);

  // Union of instructors with either a weekly schedule OR an exception on this
  // date — an instructor with no weekly blocks but an `available` exception
  // must still contribute free space.
  const instructorIds = new Set<string>(weeklyByInstructor.keys());
  for (const exKey of exceptionsByInstructorDate.keys()) {
    const sep = exKey.lastIndexOf(":");
    if (exKey.slice(sep + 1) === key) {
      instructorIds.add(exKey.slice(0, sep));
    }
  }

  const perInstructor: Interval[] = [];
  for (const instructorId of instructorIds) {
    const weekdayBlocks = (weeklyByInstructor.get(instructorId) ?? []).filter(
      (b) => b.weekday === weekday,
    );
    const exc = exceptionsByInstructorDate.get(`${instructorId}:${key}`) ?? [];
    if (weekdayBlocks.length === 0 && exc.length === 0) continue;
    perInstructor.push(...computeFreeIntervals(weekdayBlocks, exc));
  }
  return mergeIntervals(perInstructor);
}
