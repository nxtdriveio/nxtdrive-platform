-- 0021_invoices_payment_fk_pairing.sql
-- Tighten payment_record nullable-composite-FK semantics. The composite FK
-- (payment_record_id, payment_record_tenant_id) → payment_records_stub
-- treats a row with both NULL as "no payment yet" (valid), but Postgres
-- composite FKs with MATCH SIMPLE (the default) accept ANY null part — so
-- (id=<real>, tenant_id=null) would skip the FK check, breaking the
-- guarantee that a linked payment belongs to the same tenant.
--
-- Enforce that both fields are NULL together or both set together. This is
-- preparation for the upcoming Mollie integration; without it a future bug
-- could attach a payment without anchoring it to a tenant.
alter table public.invoices
  drop constraint if exists invoices_payment_record_pair_chk;
alter table public.invoices
  add constraint invoices_payment_record_pair_chk
  check (
    (payment_record_id is null and payment_record_tenant_id is null)
    or (payment_record_id is not null and payment_record_tenant_id is not null)
  );
