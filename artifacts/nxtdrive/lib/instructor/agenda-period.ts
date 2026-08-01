import { addDaysYmd, normalizeTimeZone, zonedYmd } from "@/lib/datetime";

export const INSTRUCTOR_AGENDA_MODES = [
  "day",
  "week",
  "month",
  "history",
] as const;

export type InstructorAgendaMode = (typeof INSTRUCTOR_AGENDA_MODES)[number];

export type InstructorAgendaPeriod = {
  mode: InstructorAgendaMode;
  selectedDate: string;
  todayYmd: string;
  fromYmd: string;
  toYmd: string;
  label: string;
  previousDate: string | null;
  nextDate: string | null;
};

type AgendaPeriodInput = {
  mode?: string | null;
  date?: string | null;
  now?: Date;
  timeZone?: string | null;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validYmd(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function modeFrom(value: string | null | undefined): InstructorAgendaMode {
  return INSTRUCTOR_AGENDA_MODES.includes(value as InstructorAgendaMode)
    ? (value as InstructorAgendaMode)
    : "day";
}

function startOfWeekYmd(ymd: string): string {
  const weekday = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
  return addDaysYmd(ymd, -((weekday + 6) % 7));
}

function startOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function addMonthsYmd(ymd: string, months: number): string {
  const date = new Date(`${startOfMonthYmd(ymd)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function dateForFormat(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function capitalize(value: string): string {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function periodLabel(
  mode: InstructorAgendaMode,
  fromYmd: string,
  toYmd: string,
): string {
  if (mode === "history") return "Rijleshistorie · laatste 6 maanden";

  if (mode === "day") {
    return capitalize(
      new Intl.DateTimeFormat("nl-NL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(dateForFormat(fromYmd)),
    );
  }

  if (mode === "month") {
    return capitalize(
      new Intl.DateTimeFormat("nl-NL", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(dateForFormat(fromYmd)),
    );
  }

  const endYmd = addDaysYmd(toYmd, -1);
  const formatter = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const endYear = endYmd.slice(0, 4);
  return `Week · ${formatter.format(dateForFormat(fromYmd))} – ${formatter.format(
    dateForFormat(endYmd),
  )} ${endYear}`;
}

export function resolveInstructorAgendaPeriod({
  mode: requestedMode,
  date: requestedDate,
  now = new Date(),
  timeZone,
}: AgendaPeriodInput = {}): InstructorAgendaPeriod {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const todayYmd = zonedYmd(now, resolvedTimeZone);
  const selectedDate = validYmd(requestedDate) ? requestedDate : todayYmd;
  const mode = modeFrom(requestedMode);

  if (mode === "history") {
    const fromYmd = addMonthsYmd(todayYmd, -6);
    const toYmd = addDaysYmd(todayYmd, 1);
    return {
      mode,
      selectedDate,
      todayYmd,
      fromYmd,
      toYmd,
      label: periodLabel(mode, fromYmd, toYmd),
      previousDate: null,
      nextDate: null,
    };
  }

  const fromYmd =
    mode === "week"
      ? startOfWeekYmd(selectedDate)
      : mode === "month"
        ? startOfMonthYmd(selectedDate)
        : selectedDate;
  const toYmd =
    mode === "week"
      ? addDaysYmd(fromYmd, 7)
      : mode === "month"
        ? addMonthsYmd(fromYmd, 1)
        : addDaysYmd(fromYmd, 1);
  const step =
    mode === "week"
      ? (direction: number) => addDaysYmd(fromYmd, direction * 7)
      : mode === "month"
        ? (direction: number) => addMonthsYmd(fromYmd, direction)
        : (direction: number) => addDaysYmd(fromYmd, direction);

  return {
    mode,
    selectedDate,
    todayYmd,
    fromYmd,
    toYmd,
    label: periodLabel(mode, fromYmd, toYmd),
    previousDate: step(-1),
    nextDate: step(1),
  };
}
