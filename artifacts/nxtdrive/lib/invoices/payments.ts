/**
 * Per-invoice payment history (the `payment_records` ledger).
 *
 * `payment_records` is staff-only by RLS, so:
 *  - the backoffice reads it with the RLS client (admins + instructors pass the
 *    `payment_records_select_admin` policy),
 *  - the student/parent surface must read it with the service-role client AFTER
 *    verifying the caller owns the invoice, scoped to that invoice + tenant.
 */
export type PaymentRecord = {
  id: string;
  provider: string | null;
  provider_payment_id: string | null;
  amount_cents: number;
  currency: string | null;
  method: string | null;
  mollie_status: string | null;
  paid_at: string | null;
  counted_at: string | null;
  created_at: string;
};

/** Columns to select for a payment-history row. */
export const PAYMENT_RECORD_COLUMNS =
  "id, provider, provider_payment_id, amount_cents, currency, method, mollie_status, paid_at, counted_at, created_at";

/** Best-effort timestamp a payment actually happened on, for sorting/display. */
export function paymentRecordDate(rec: PaymentRecord): string {
  return rec.paid_at ?? rec.counted_at ?? rec.created_at;
}

const MOLLIE_METHOD_LABELS: Record<string, string> = {
  ideal: "iDEAL",
  creditcard: "Creditcard",
  bancontact: "Bancontact",
  banktransfer: "Bankoverschrijving",
  paypal: "PayPal",
  applepay: "Apple Pay",
  sofort: "SOFORT",
  giropay: "Giropay",
  belfius: "Belfius",
  kbc: "KBC",
};

/**
 * Friendly Dutch label for how a payment was made. `plain` strips the
 * "(online)" provider hint for the student-facing view.
 */
export function paymentMethodLabel(
  rec: Pick<PaymentRecord, "provider" | "method">,
  opts: { plain?: boolean } = {},
): string {
  const provider = (rec.provider ?? "").toLowerCase();
  const method = (rec.method ?? "").trim();

  if (provider === "mollie") {
    const mapped = MOLLIE_METHOD_LABELS[method.toLowerCase()];
    if (mapped) return opts.plain ? mapped : `${mapped} (online)`;
    return opts.plain ? "Online" : "Online (Mollie)";
  }

  // Manual payments: the school types the method ("contant", "overschrijving"),
  // or it's one of our internal markers.
  if (!method || method === "manual" || method === "manual_mark_paid") {
    return "Handmatig geregistreerd";
  }
  return method.charAt(0).toUpperCase() + method.slice(1);
}

/** Sum of payment amounts, for reconciling against `amount_paid_cents`. */
export function totalPaymentCents(records: PaymentRecord[]): number {
  return records.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
}
