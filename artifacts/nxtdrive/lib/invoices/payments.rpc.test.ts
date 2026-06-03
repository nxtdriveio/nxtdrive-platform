/**
 * Money-path idempotency guard for the Mollie payment flow.
 *
 * The webhook -> confirm_mollie_payment -> record_invoice_payment chain is
 * idempotent by design (see supabase/migrations/0082..0084). These tests pin
 * that behaviour by running the *real* PL/pgSQL function bodies (extracted from
 * the migration files) inside an in-process Postgres (PGlite). A single Mollie
 * 'paid' callback must credit an invoice exactly once; a replayed (duplicate)
 * callback must be a no-op; partial payments must accumulate and only flip the
 * invoice to 'paid' once fully settled.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../supabase/migrations",
);

/**
 * Extract a single `create or replace function public.<name>(...) ... $$;`
 * block from a migration file, so the test always runs the live SQL rather
 * than a hand-copied reimplementation. We deliberately stop at the closing
 * `$$;` to skip the trailing revoke/grant lines (those reference Supabase
 * roles like service_role that don't exist in PGlite).
 */
function extractFunction(sql: string, name: string): string {
  const marker = `create or replace function public.${name}(`;
  const start = sql.indexOf(marker);
  if (start === -1) {
    throw new Error(`function ${name} not found in migration`);
  }
  const end = sql.indexOf("$$;", start);
  if (end === -1) {
    throw new Error(`end of function ${name} not found in migration`);
  }
  return sql.slice(start, end + 3);
}

function readMigration(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

// Minimal schema covering only the columns the two money RPCs touch. The real
// function bodies (loaded below) run unchanged against it.
const BOOTSTRAP_SCHEMA = `
create type public.invoice_status as enum ('draft', 'open', 'paid', 'cancelled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null default 'invoice',
  status public.invoice_status not null default 'open',
  total_cents integer not null,
  amount_paid_cents integer not null default 0,
  installment_plan_id uuid,
  paid_at timestamptz,
  mollie_status text,
  mollie_payment_id text,
  mollie_checkout_url text,
  mollie_amount_cents integer,
  payment_record_id uuid,
  payment_record_tenant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,
  provider_payment_id text,
  amount_cents integer not null,
  currency text not null default 'EUR',
  method text,
  mollie_status text,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  invoice_id uuid,
  invoice_tenant_id uuid,
  description text,
  counted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  tenant_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
`;

const TENANT = "11111111-1111-1111-1111-111111111111";

type Harness = {
  db: PGlite;
  invoiceId: string;
  confirm: (args: {
    paymentId: string;
    status?: string;
    amountCents: number;
  }) => Promise<void>;
  paymentRowCount: () => Promise<number>;
  auditRowCount: () => Promise<number>;
  invoice: () => Promise<{ status: string; amount_paid_cents: number }>;
};

async function setup(totalCents: number): Promise<Harness> {
  const db = new PGlite();
  await db.exec("create schema if not exists public;");
  await db.exec(BOOTSTRAP_SCHEMA);

  // Load the live function bodies (latest definitions across migrations).
  await db.exec(
    extractFunction(
      readMigration("0083_partial_payments_overpay_guard.sql"),
      "record_invoice_payment",
    ),
  );
  await db.exec(
    extractFunction(
      readMigration("0084_payment_ledger_completeness.sql"),
      "confirm_mollie_payment",
    ),
  );

  const res = await db.query<{ id: string }>(
    `insert into public.invoices (tenant_id, kind, status, total_cents)
     values ($1, 'invoice', 'open', $2) returning id`,
    [TENANT, totalCents],
  );
  const invoiceId = res.rows[0]!.id;

  return {
    db,
    invoiceId,
    async confirm({ paymentId, status = "paid", amountCents }) {
      await db.query(
        `select public.confirm_mollie_payment(
           $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
           $6::integer, $7::text, $8::text, $9::timestamptz, $10::jsonb
         )`,
        [
          TENANT,
          null,
          invoiceId,
          paymentId,
          status,
          amountCents,
          "EUR",
          "ideal",
          new Date().toISOString(),
          JSON.stringify({ id: paymentId, status, amount: amountCents }),
        ],
      );
    },
    async paymentRowCount() {
      const r = await db.query<{ n: number }>(
        `select count(*)::int as n from public.payment_records where invoice_id = $1`,
        [invoiceId],
      );
      return r.rows[0]!.n;
    },
    async auditRowCount() {
      const r = await db.query<{ n: number }>(
        `select count(*)::int as n from public.audit_log where target_id = $1`,
        [invoiceId],
      );
      return r.rows[0]!.n;
    },
    async invoice() {
      const r = await db.query<{ status: string; amount_paid_cents: number }>(
        `select status, amount_paid_cents from public.invoices where id = $1`,
        [invoiceId],
      );
      return r.rows[0]!;
    },
  };
}

test("a single Mollie 'paid' callback credits the invoice exactly once", async () => {
  const h = await setup(10000);
  try {
    await h.confirm({ paymentId: "tr_single", amountCents: 10000 });

    const inv = await h.invoice();
    assert.equal(inv.status, "paid");
    assert.equal(inv.amount_paid_cents, 10000);
    // Exactly one ledger row and one audit entry (invoice.paid_via_mollie).
    assert.equal(await h.paymentRowCount(), 1);
    assert.equal(await h.auditRowCount(), 1);
  } finally {
    await h.db.close();
  }
});

test("replaying the same Mollie webhook does not double-credit the invoice", async () => {
  const h = await setup(10000);
  try {
    await h.confirm({ paymentId: "tr_replay", amountCents: 10000 });
    // Duplicate delivery of the identical webhook.
    await h.confirm({ paymentId: "tr_replay", amountCents: 10000 });
    await h.confirm({ paymentId: "tr_replay", amountCents: 10000 });

    const inv = await h.invoice();
    assert.equal(inv.status, "paid");
    // Balance unchanged, no second ledger row, no extra audit entry.
    assert.equal(inv.amount_paid_cents, 10000);
    assert.equal(await h.paymentRowCount(), 1);
    assert.equal(await h.auditRowCount(), 1);
  } finally {
    await h.db.close();
  }
});

test("two partial Mollie payments accumulate and only flip to paid when settled", async () => {
  const h = await setup(10000);
  try {
    // First partial payment: invoice stays open, balance tracks the part paid.
    await h.confirm({ paymentId: "tr_part1", amountCents: 4000 });
    let inv = await h.invoice();
    assert.equal(inv.status, "open");
    assert.equal(inv.amount_paid_cents, 4000);
    assert.equal(await h.paymentRowCount(), 1);
    assert.equal(await h.auditRowCount(), 1);

    // Replaying the first partial must not double-count it.
    await h.confirm({ paymentId: "tr_part1", amountCents: 4000 });
    inv = await h.invoice();
    assert.equal(inv.amount_paid_cents, 4000);
    assert.equal(await h.paymentRowCount(), 1);

    // Second partial payment settles the rest and flips the invoice to paid.
    await h.confirm({ paymentId: "tr_part2", amountCents: 6000 });
    inv = await h.invoice();
    assert.equal(inv.status, "paid");
    assert.equal(inv.amount_paid_cents, 10000);
    assert.equal(await h.paymentRowCount(), 2);
    assert.equal(await h.auditRowCount(), 2);
  } finally {
    await h.db.close();
  }
});
