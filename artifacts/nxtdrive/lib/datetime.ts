export const APP_TIME_ZONE = "Europe/Amsterdam";
export const DEFAULT_TENANT_TIME_ZONE = APP_TIME_ZONE;

type TimeZoneSource =
  | string
  | {
      timezone?: string | null;
    }
  | null
  | undefined;

const validTimeZones = new Map<string, string>();

export function normalizeTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone?.trim() || DEFAULT_TENANT_TIME_ZONE;
  const cached = validTimeZones.get(candidate);
  if (cached) return cached;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    validTimeZones.set(candidate, candidate);
    return candidate;
  } catch {
    validTimeZones.set(candidate, DEFAULT_TENANT_TIME_ZONE);
    return DEFAULT_TENANT_TIME_ZONE;
  }
}

export function resolveTenantTimeZone(source?: TimeZoneSource): string {
  if (typeof source === "string") return normalizeTimeZone(source);
  return normalizeTimeZone(source?.timezone);
}

function formatterParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = APP_TIME_ZONE,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: normalizeTimeZone(options.timeZone ?? timeZone),
    hour12: false,
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

/** Dutch formatter that renders in an explicit IANA timezone. */
export function createNlDateTimeFormatter(
  options: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("nl-NL", {
    ...options,
    timeZone: normalizeTimeZone(options.timeZone ?? timeZone),
  });
}

/**
 * Calendar date (YYYY-MM-DD) of `date` in the Amsterdam timezone.
 */
export function zonedYmd(date: Date, timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function amsterdamYmd(date: Date): string {
  return zonedYmd(date, APP_TIME_ZONE);
}

/**
 * Hour of the provided instant in the Amsterdam timezone.
 */
export function zonedHour(date: Date, timeZone: string = APP_TIME_ZONE): number {
  const parts = formatterParts(date, { hour: "2-digit" }, timeZone);
  return Number(parts["hour"] === "24" ? "0" : parts["hour"] ?? "0");
}

export function amsterdamHour(date: Date): number {
  return zonedHour(date, APP_TIME_ZONE);
}

export function zonedMinuteOfDay(
  date: Date,
  timeZone: string = APP_TIME_ZONE,
): number {
  const parts = formatterParts(date, {
    hour: "2-digit",
    minute: "2-digit",
  }, timeZone);
  const hour = Number(parts["hour"] === "24" ? "0" : parts["hour"] ?? "0");
  return hour * 60 + Number(parts["minute"] ?? "0");
}

export function amsterdamMinuteOfDay(date: Date): number {
  return zonedMinuteOfDay(date, APP_TIME_ZONE);
}

export function zonedWeekdayIndex(
  date: Date,
  timeZone: string = APP_TIME_ZONE,
): number {
  const day = new Date(`${zonedYmd(date, timeZone)}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

export function amsterdamWeekdayIndex(date: Date): number {
  return zonedWeekdayIndex(date, APP_TIME_ZONE);
}

/**
 * Milliseconds to add to a UTC instant so that, when read in Amsterdam time,
 * it shows the same wall-clock time. Used to derive DST-safe local midnights.
 */
function zonedOffsetMs(date: Date, timeZone: string = APP_TIME_ZONE): number {
  const parts = formatterParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }, timeZone);
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"] === "24" ? "0" : parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUtc - date.getTime();
}

/**
 * UTC instant corresponding to local midnight (00:00 Amsterdam) of `ymd`.
 */
export function startOfZonedDayUtc(
  ymd: string,
  timeZone: string = APP_TIME_ZONE,
): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  return new Date(guess.getTime() - zonedOffsetMs(guess, timeZone));
}

export function startOfAmsterdamDayUtc(ymd: string): Date {
  return startOfZonedDayUtc(ymd, APP_TIME_ZONE);
}

export function zonedWallTimeToUtc(
  ymd: string,
  hour: number,
  minute = 0,
  second = 0,
  timeZone: string = APP_TIME_ZONE,
): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(wallClockUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = new Date(wallClockUtc - zonedOffsetMs(instant, timeZone));
  }
  return instant;
}

export function amsterdamWallTimeToUtc(
  ymd: string,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  return zonedWallTimeToUtc(ymd, hour, minute, second, APP_TIME_ZONE);
}

export function parseZonedDateTime(
  value: string,
  timeZone: string = APP_TIME_ZONE,
): Date | null {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) {
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
  const [, date, hour, minute, second] = match;
  const parsed = zonedWallTimeToUtc(
    date,
    Number(hour),
    Number(minute),
    second ? Number(second) : 0,
    timeZone,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseAmsterdamDateTime(value: string): Date | null {
  return parseZonedDateTime(value, APP_TIME_ZONE);
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isSameAmsterdamDay(left: Date, right: Date): boolean {
  return amsterdamYmd(left) === amsterdamYmd(right);
}

export function isSameZonedDay(
  left: Date,
  right: Date,
  timeZone: string = APP_TIME_ZONE,
): boolean {
  return zonedYmd(left, timeZone) === zonedYmd(right, timeZone);
}
