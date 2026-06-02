export const INVOICE_STATUSES = [
  "draft",
  "open",
  "paid",
  "cancelled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Concept",
  open: "Openstaand",
  paid: "Betaald",
  cancelled: "Geannuleerd",
};

export const INVOICE_STATUS_VARIANT: Record<
  InvoiceStatus,
  "default" | "info" | "success" | "warning" | "danger"
> = {
  draft: "default",
  open: "info",
  paid: "success",
  cancelled: "warning",
};

export const INVOICE_KINDS = ["invoice", "credit_note"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  invoice: "Factuur",
  credit_note: "Creditfactuur",
};

export type Invoice = {
  id: string;
  tenant_id: string;
  student_id: string;
  invoice_no: number;
  kind: InvoiceKind;
  credit_of_invoice_id: string | null;
  installment_plan_id: string | null;
  installment_no: number | null;
  installment_count: number | null;
  status: InvoiceStatus;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  payment_record_id: string | null;
  payment_record_tenant_id: string | null;
  mollie_payment_id: string | null;
  mollie_checkout_url: string | null;
  mollie_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Human label for an installment invoice, e.g. "Termijn 2 van 4". */
export function installmentLabel(invoice: {
  installment_no: number | null;
  installment_count: number | null;
}): string | null {
  if (invoice.installment_no === null || invoice.installment_count === null) {
    return null;
  }
  return `Termijn ${invoice.installment_no} van ${invoice.installment_count}`;
}

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  tenant_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_bp: number;
  amount_cents: number;
  tax_amount_cents: number;
  related_package_id: string | null;
  position: number;
  created_at: string;
};

/**
 * UI-only derived status. An invoice with status='open' whose due_date has
 * passed is rendered as 'overdue'. We never store this — recomputed on read.
 */
export type DisplayStatus = InvoiceStatus | "overdue";

export function displayStatus(invoice: {
  status: InvoiceStatus;
  due_date: string | null;
}): DisplayStatus {
  if (invoice.status === "open" && invoice.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(invoice.due_date);
    if (due < today) return "overdue";
  }
  return invoice.status;
}

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  ...INVOICE_STATUS_LABEL,
  overdue: "Verlopen",
};

export const DISPLAY_STATUS_VARIANT: Record<
  DisplayStatus,
  "default" | "info" | "success" | "warning" | "danger"
> = {
  ...INVOICE_STATUS_VARIANT,
  overdue: "danger",
};

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/**
 * Convert a euros string to integer cents. Accepts both Dutch ("1.250,50",
 * "12,50") and English ("1,250.50", "12.50") formatting. Heuristic: if the
 * input contains both a comma and a dot, the right-most character is the
 * decimal separator; otherwise a lone comma is treated as decimal (Dutch
 * default) and a lone dot as decimal (English).
 */
export function parseEurosToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = trimmed;
  } else if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = trimmed.replace(/,/g, "");
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}
