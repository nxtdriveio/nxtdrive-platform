// ---------------------------------------------------------------------------
// Availability (beschikbaarheid) domain types + small time helpers.
//
// Times are stored as integer MINUTES from midnight (0..1440), interpreted in
// Europe/Amsterdam for product-facing planning. Weekday uses JS getUTCDay()
// semantics: 0=Sunday .. 6=Sat.
// ---------------------------------------------------------------------------

export type AvailabilityExceptionKind = "available" | "blocked";

export type WeeklyAvailability = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  instructor_id: string;
  weekday: number; // 0=Sunday .. 6=Saturday
  start_min: number;
  end_min: number;
  created_at: string;
  updated_at: string;
};

export type AvailabilityException = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  instructor_id: string;
  exception_date: string; // YYYY-MM-DD
  kind: AvailabilityExceptionKind;
  start_min: number | null; // null = whole day
  end_min: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// A single block submitted by the weekly editor.
export type WeeklyBlockInput = {
  weekday: number;
  start_min: number;
  end_min: number;
};

// A resolved free interval (minutes from midnight) for one calendar day.
export type Interval = { start_min: number; end_min: number };

// Weekday order for display: Monday-first (Dutch calendars), mapped to the
// 0=Sunday..6=Saturday storage convention.
export const WEEKDAY_ORDER: number[] = [1, 2, 3, 4, 5, 6, 0];

export const WEEKDAY_LABEL: Record<number, string> = {
  0: "Zondag",
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  0: "Zo",
  1: "Ma",
  2: "Di",
  3: "Wo",
  4: "Do",
  5: "Vr",
  6: "Za",
};

export const EXCEPTION_KIND_LABEL: Record<AvailabilityExceptionKind, string> = {
  available: "Extra beschikbaar",
  blocked: "Niet beschikbaar",
};

// Student daypart preference (matches intake dayparts).
export const STUDENT_DAYPARTS = [
  "morning",
  "afternoon",
  "evening",
  "weekend",
] as const;
export type StudentDaypart = (typeof STUDENT_DAYPARTS)[number];
export const STUDENT_DAYPART_LABEL: Record<StudentDaypart, string> = {
  morning: "Ochtend",
  afternoon: "Middag",
  evening: "Avond",
  weekend: "Weekend",
};

// minutes -> "HH:MM"
export function minutesToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "HH:MM" -> minutes (returns null if malformed / out of range)
export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  if (total < 0 || total > 1440) return null;
  return total;
}

export function formatInterval(iv: Interval): string {
  return `${minutesToHHMM(iv.start_min)}–${minutesToHHMM(iv.end_min)}`;
}
