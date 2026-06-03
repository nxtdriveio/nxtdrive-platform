// ---------------------------------------------------------------------------
// Post-Mollie return-status derivation (shared, pure, testable).
//
// Mollie redirects the student back to the invoice page with `?paid=1` whatever
// the outcome (success, cancel, expire), and the webhook that confirms the
// payment server-side can land a moment later. The invoice detail page turns the
// observable facts (did we just return from Mollie, the invoice kind/status, the
// last Mollie status, the outstanding balance) into a single banner state.
//
// This logic is extracted here so it can be unit-tested without rendering the
// server component or standing up a database:
//
//   - "paid":    the invoice is settled (status paid or nothing left to pay).
//   - "failed":  Mollie reported the attempt cancelled / expired / failed.
//   - "pending": we returned but the confirming webhook has not landed yet.
//   - null:      we did not just return from Mollie, or this is not a payable
//                invoice (e.g. a credit note), so no banner is shown.
// ---------------------------------------------------------------------------

export type PaymentReturnStatus = "paid" | "pending" | "failed";

/** Mollie payment statuses that mean the attempt did not result in a payment. */
export const MOLLIE_FAILED_STATUSES = new Set([
  "canceled",
  "expired",
  "failed",
]);

export type PaymentReturnInput = {
  /** True when the page was reached via Mollie's `?paid=1` return redirect. */
  justPaid: boolean;
  /** Invoice kind — only real invoices can be paid online. */
  kind: string;
  /** Invoice lifecycle status (draft/open/paid/...). */
  status: string;
  /** Last known Mollie status for the invoice, if any. */
  mollieStatus: string | null;
  /** Outstanding balance in cents (never negative). */
  remainingCents: number;
};

/**
 * Derive the post-Mollie banner state from the observable invoice facts.
 * Returns null when no banner should be shown. Pure: no I/O, no clock.
 */
export function derivePaymentReturnStatus(
  input: PaymentReturnInput,
): PaymentReturnStatus | null {
  if (!input.justPaid || input.kind !== "invoice") return null;
  if (input.status === "paid" || input.remainingCents === 0) return "paid";
  if (input.mollieStatus && MOLLIE_FAILED_STATUSES.has(input.mollieStatus)) {
    return "failed";
  }
  return "pending";
}
