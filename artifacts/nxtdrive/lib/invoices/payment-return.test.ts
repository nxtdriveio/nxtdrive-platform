import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePaymentReturnStatus,
  type PaymentReturnInput,
} from "./payment-return";

function input(overrides: Partial<PaymentReturnInput>): PaymentReturnInput {
  return {
    justPaid: true,
    kind: "invoice",
    status: "open",
    mollieStatus: null,
    remainingCents: 10000,
    ...overrides,
  };
}

test("no banner unless we just returned from Mollie", () => {
  assert.equal(derivePaymentReturnStatus(input({ justPaid: false })), null);
});

test("no banner for non-invoice kinds (e.g. credit notes)", () => {
  assert.equal(
    derivePaymentReturnStatus(input({ kind: "credit_note" })),
    null,
  );
});

test("paid when the invoice status is paid", () => {
  assert.equal(
    derivePaymentReturnStatus(input({ status: "paid", remainingCents: 0 })),
    "paid",
  );
});

test("paid when nothing is left to pay, even if status lags", () => {
  // Webhook settled the balance but the status flip has not propagated yet.
  assert.equal(
    derivePaymentReturnStatus(input({ status: "open", remainingCents: 0 })),
    "paid",
  );
});

test("failed for each terminal Mollie status while balance remains", () => {
  for (const mollieStatus of ["canceled", "expired", "failed"]) {
    assert.equal(
      derivePaymentReturnStatus(input({ mollieStatus })),
      "failed",
      `expected failed for mollie_status=${mollieStatus}`,
    );
  }
});

test("pending when returned but the webhook has not landed yet", () => {
  assert.equal(
    derivePaymentReturnStatus(input({ mollieStatus: null })),
    "pending",
  );
  // A still-open Mollie status is not terminal → keep waiting.
  assert.equal(
    derivePaymentReturnStatus(input({ mollieStatus: "open" })),
    "pending",
  );
  assert.equal(
    derivePaymentReturnStatus(input({ mollieStatus: "pending" })),
    "pending",
  );
});

test("paid takes precedence over a stale failed Mollie status", () => {
  // If the invoice is settled, a leftover non-paid mollie_status must not
  // downgrade the confirmation to 'failed'.
  assert.equal(
    derivePaymentReturnStatus(
      input({ status: "paid", remainingCents: 0, mollieStatus: "expired" }),
    ),
    "paid",
  );
});
