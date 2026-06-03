import { test } from "node:test";
import assert from "node:assert/strict";
import { displayStatus, remainingCents } from "./types";

test("remainingCents returns the outstanding balance, never negative", () => {
  assert.equal(
    remainingCents({ total_cents: 10000, amount_paid_cents: 0 }),
    10000,
  );
  assert.equal(
    remainingCents({ total_cents: 10000, amount_paid_cents: 4000 }),
    6000,
  );
  assert.equal(
    remainingCents({ total_cents: 10000, amount_paid_cents: 10000 }),
    0,
  );
  // Overpayment / corrections never produce a negative remaining.
  assert.equal(
    remainingCents({ total_cents: 10000, amount_paid_cents: 12000 }),
    0,
  );
});

test("displayStatus flags a partially-paid open invoice", () => {
  assert.equal(
    displayStatus({
      status: "open",
      due_date: null,
      amount_paid_cents: 4000,
      total_cents: 10000,
    }),
    "partially_paid",
  );
});

test("partially_paid takes precedence over overdue", () => {
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  assert.equal(
    displayStatus({
      status: "open",
      due_date: yesterday,
      amount_paid_cents: 4000,
      total_cents: 10000,
    }),
    "partially_paid",
  );
});

test("an open invoice with nothing paid is overdue when past due", () => {
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  assert.equal(
    displayStatus({
      status: "open",
      due_date: yesterday,
      amount_paid_cents: 0,
      total_cents: 10000,
    }),
    "overdue",
  );
});

test("a fully-paid open invoice is not partially_paid", () => {
  // status would normally be flipped to 'paid' server-side, but guard the edge.
  assert.equal(
    displayStatus({
      status: "open",
      due_date: null,
      amount_paid_cents: 10000,
      total_cents: 10000,
    }),
    "open",
  );
});

test("displayStatus is backward-compatible without payment fields", () => {
  assert.equal(displayStatus({ status: "draft", due_date: null }), "draft");
  assert.equal(displayStatus({ status: "paid", due_date: null }), "paid");
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  assert.equal(
    displayStatus({ status: "open", due_date: yesterday }),
    "overdue",
  );
});
