export const CREDIT_REASONS = [
  "package_purchase",
  "package_refund",
  "lesson_consumed",
  "lesson_refund",
  "adjustment",
  "opening_balance",
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const CREDIT_REASON_LABEL: Record<CreditReason, string> = {
  package_purchase: "Pakket toegekend",
  package_refund: "Pakket teruggeboekt",
  lesson_consumed: "Les verbruikt",
  lesson_refund: "Les teruggeboekt",
  adjustment: "Handmatige correctie",
  opening_balance: "Beginsaldo",
};

export type Student = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  lead_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreditLedgerRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  delta: number;
  reason: CreditReason;
  related_type: string | null;
  related_id: string | null;
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export type StudentBalance = {
  student_id: string;
  tenant_id: string;
  balance: number;
};

// Tegoed is stored internally in MINUTES (exact — lessons consume whole minutes)
// and displayed to users in hours ("uren"). 90 minutes => "1,5 uur".
const HOURS_FMT = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

/** Format a minute amount as a Dutch decimal number of hours (e.g. 90 => "1,5"). */
export function formatHours(minutes: number): string {
  return HOURS_FMT.format(minutes / 60);
}

/** Format a minute amount as a labelled tegoed value (e.g. 90 => "1,5 uur"). */
export function formatTegoed(minutes: number): string {
  return `${formatHours(minutes)} uur`;
}

/** Format a signed ledger delta in minutes (e.g. -60 => "−1 uur", 90 => "+1,5 uur"). */
export function formatTegoedDelta(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  return `${sign}${formatHours(Math.abs(minutes))} uur`;
}

/** Convert a (possibly decimal) number of hours to whole minutes for storage. */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}
