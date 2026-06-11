export const APP_TIME_ZONE = "Europe/Amsterdam";

function formatterParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour12: false,
    ...options,
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

/**
 * Dutch formatter that always renders in the Amsterdam timezone, regardless of
 * the server locale or browser timezone.
 */
export function createNlDateTimeFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("nl-NL", {
    ...options,
    timeZone: options.timeZone ?? APP_TIME_ZONE,
  });
}

/**
 * Calendar date (YYYY-MM-DD) of `date` in the Amsterdam timezone.
 */
export function amsterdamYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Hour of the provided instant in the Amsterdam timezone.
 */
export function amsterdamHour(date: Date): number {
  const parts = formatterParts(date, { hour: "2-digit" });
  return Number(parts["hour"] === "24" ? "0" : parts["hour"] ?? "0");
}

/**
 * Milliseconds to add to a UTC instant so that, when read in Amsterdam time,
 * it shows the same wall-clock time. Used to derive DST-safe local midnights.
 */
function amsterdamOffsetMs(date: Date): number {
  const parts = formatterParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
export function startOfAmsterdamDayUtc(ymd: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  return new Date(guess.getTime() - amsterdamOffsetMs(guess));
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isSameAmsterdamDay(left: Date, right: Date): boolean {
  return amsterdamYmd(left) === amsterdamYmd(right);
}
