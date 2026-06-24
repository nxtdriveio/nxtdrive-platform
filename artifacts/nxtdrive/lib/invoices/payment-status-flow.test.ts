import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoicePaymentStatusFlow,
  type InvoicePaymentStatusFlow,
} from "./payment-status-flow";
import type { Invoice } from "./types";

const baseInvoice: Invoice = {
  id: "inv_1",
  tenant_id: "tenant_1",
  branch_id: null,
  student_id: "student_1",
  invoice_no: 42,
  kind: "invoice",
  credit_of_invoice_id: null,
  installment_plan_id: null,
  installment_no: null,
  installment_count: null,
  status: "open",
  issued_at: "2026-06-01",
  due_date: "2026-06-30",
  paid_at: null,
  subtotal_cents: 10000,
  tax_cents: 2100,
  total_cents: 12100,
  amount_paid_cents: 0,
  notes: null,
  payment_record_id: null,
  payment_record_tenant_id: null,
  mollie_payment_id: null,
  mollie_checkout_url: null,
  mollie_status: null,
  mollie_amount_cents: null,
  created_by: null,
  created_at: "2026-06-01T08:00:00Z",
  updated_at: "2026-06-01T08:00:00Z",
};

function flow(overrides: Partial<Invoice> = {}): InvoicePaymentStatusFlow {
  return buildInvoicePaymentStatusFlow(
    { ...baseInvoice, ...overrides },
    { mollieConfigured: true, todayYmd: "2026-06-23" },
  );
}

test("open invoice becomes directly payable when Mollie is configured", () => {
  const result = flow();

  assert.equal(result.displayStatus, "open");
  assert.equal(result.canPayOnline, true);
  assert.equal(result.action, "pay_online");
  assert.equal(result.remainingCents, 12100);
  assert.equal(result.dueLabel, "Vervalt over 7 dagen");
});

test("partial invoice explains the remaining amount", () => {
  const result = flow({ amount_paid_cents: 5000 });

  assert.equal(result.displayStatus, "partially_paid");
  assert.equal(result.badgeLabel, "Deels betaald");
  assert.equal(result.progressPct, 41);
  assert.equal(result.remainingCents, 7100);
});

test("overdue invoice takes action-required status", () => {
  const result = flow({ due_date: "2026-06-10" });

  assert.equal(result.displayStatus, "overdue");
  assert.equal(result.badgeVariant, "danger");
  assert.equal(result.dueLabel, "13 dagen verlopen");
});

test("processing blocks a second online payment action", () => {
  const result = buildInvoicePaymentStatusFlow(baseInvoice, {
    mollieConfigured: true,
    paymentProcessing: true,
    todayYmd: "2026-06-23",
  });

  assert.equal(result.displayStatus, "processing");
  assert.equal(result.canPayOnline, false);
  assert.equal(result.action, "wait");
});

test("credit notes are never payable", () => {
  const result = flow({ kind: "credit_note", total_cents: -12100 });

  assert.equal(result.displayStatus, "not_payable");
  assert.equal(result.canPayOnline, false);
  assert.equal(result.action, "none");
});
