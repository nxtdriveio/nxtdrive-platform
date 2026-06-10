const APP_TIME_ZONE = "Europe/Amsterdam";

export function createNlDateTimeFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: APP_TIME_ZONE,
    ...options,
  });
}

export function amsterdamHour(date: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(formatted);
}

export function isSameAmsterdamDay(left: Date, right: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(left) === fmt.format(right);
}
