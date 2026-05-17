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
