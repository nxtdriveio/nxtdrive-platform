-- 0082_partial_payments.sql
-- Task #133 — Partial payments + Mollie checkout for installment invoices.
--
-- Until now an invoice (incl. each termijn of an installment plan) could only
-- flip from 'open' to fully 'paid'. Driving schools routinely receive a
-- payment that covers only part of an invoice (a deposit, a first instalment
-- paid in cash, a student paying half online now and half later). This
-- migration adds a money "ledger" of partial payments on top of the existing
-- payment_records table and tracks the cumulative paid amount on the invoice.
--
-- Design (mirrors the credit_ledger discipline: no balance mutation without a
-- ledger row + audit, all writes via SECURITY DEFINER RPCs, service-role only):
--
--   * invoices.amount_paid_cents — cumulative confirmed payments. Maintained
--     ONLY inside the RPCs below, never client-side. 'partially_paid' is a
--     UI-derived state (0 < amount_paid_cents < total_cents); the canonical
--     status stays 'open' until fully covered, then flips to 'paid'.
--   * payment_records.counted_at — set the moment a payment row is applied to
--     an invoice's balance. This makes accumulation exactly-once even when a
--     payment_records row already existed (e.g. a non-paid Mollie status was
--     recorded earlier, then the same payment later turns 'paid').
--   * record_invoice_payment(...) — the single money-payment recorder. Inserts
--     a payment_records row (the ledger entry) + audit_log, accumulates the
--     invoice balance, and flips the invoice to 'paid' (releasing installment
--     tegoed) once cumulative >= total. Handles BOTH manual partial payments
--     and the Mollie webhook. Idempotent on (tenant, provider_payment_id).
--   * confirm_mollie_payment(...) reworked to record partial Mollie payments
--     via record_invoice_payment instead of rejecting any amount < total.
--   * set_invoice_status(...) keeps the legacy "mark as paid" shortcut, now
--     also syncing amount_paid_cents := total_cents so the two paths agree.
--
-- A single invoice may now carry several Mollie payments over its lifetime
-- (e.g. two partial online payments), so the old strict 1:1 mollie_payment_id
-- binding check in confirm_mollie_payment is relaxed: the webhook already
-- authenticates each payment by re-fetching it with the tenant's own API key
-- and matching metadata.invoice_id, and payment_records stays idempotent per
-- provider_payment_id.

-- ===========================================================================
-- 1. invoices.amount_paid_cents — cumulative confirmed payments.
-- ===========================================================================
alter table public.invoices
  add column if not exists amount_paid_cents integer not null default 0;

alter table public.invoices
  drop constraint if exists invoices_amount_paid_nonneg_check;
alter table public.invoices
  add constraint invoices_amount_paid_nonneg_check
    check (amount_paid_cents >= 0);

-- Backfill: invoices already 'paid' are fully covered. Credit notes (negative
-- totals) keep amount_paid_cents = 0.
update public.invoices
   set amount_paid_cents = total_cents
 where status = 'paid'
   and kind = 'invoice'
   and total_cents > 0
   and amount_paid_cents = 0;

-- ===========================================================================
-- 2. payment_records.counted_at — when this payment was applied to a balance.
-- ===========================================================================
alter table public.payment_records
  add column if not exists counted_at timestamptz;

-- Backfill: existing Mollie 'paid' rows that are linked to an invoice were
-- already counted by the old confirm_mollie_payment (which flipped the invoice
-- straight to paid). Mark them counted so a future webhook retry can't double
-- count via the new accumulation path.
update public.payment_records
   set counted_at = coalesce(paid_at, updated_at, created_at)
 where counted_at is null
   and invoice_id is not null
   and mollie_status = 'paid';

-- ===========================================================================
-- 3. record_invoice_payment — the money-payment ledger writer.
--    Used by manual partial payments AND the Mollie webhook. Idempotent on
--    (tenant, provider_payment_id) for provider payments; manual payments have
--    no provider_payment_id so each call records a fresh row.
-- ===========================================================================
create or replace function public.record_invoice_payment(
  p_tenant_id           uuid,
  p_actor               uuid,
  p_invoice_id          uuid,
  p_amount_cents        integer,
  p_method              text,
  p_provider            text,
  p_provider_payment_id text,
  p_currency            text,
  p_paid_at             timestamptz,
  p_note                text,
  p_raw_payload         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status      public.invoice_status;
  v_kind        text;
  v_total       integer;
  v_paid        integer;
  v_plan        uuid;
  v_provider    text := coalesce(nullif(trim(p_provider), ''), 'manual');
  v_currency    text := coalesce(nullif(trim(p_currency), ''), 'EUR');
  v_pr_id       uuid;
  v_existing    uuid;
  v_existing_ct timestamptz;
  v_new_paid    integer;
  v_fully_paid  boolean := false;
begin
  if p_tenant_id is null or p_invoice_id is null then
    raise exception 'tenant_id and invoice_id are required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents must be > 0';
  end if;
  if v_currency <> 'EUR' then
    raise exception 'unsupported currency %', v_currency;
  end if;

  select status, kind, total_cents, amount_paid_cents, installment_plan_id
    into v_status, v_kind, v_total, v_paid, v_plan
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_kind <> 'invoice' then
    raise exception 'cannot record a payment against a % ', v_kind;
  end if;
  if v_status not in ('open', 'paid') then
    raise exception 'invoice % is % and cannot take payments', p_invoice_id, v_status;
  end if;

  -- Idempotency for provider payments: a given provider_payment_id maps to one
  -- ledger row. If it already exists AND was already counted, this is a retry
  -- (e.g. a duplicate Mollie webhook) — refresh its metadata and return.
  if p_provider_payment_id is not null then
    select id, counted_at into v_existing, v_existing_ct
      from public.payment_records
     where tenant_id = p_tenant_id
       and provider_payment_id = p_provider_payment_id
     for update;
    if found then
      update public.payment_records
         set amount_cents  = p_amount_cents,
             method        = coalesce(p_method, method),
             mollie_status = coalesce(p_raw_payload->>'status', mollie_status),
             paid_at       = coalesce(p_paid_at, paid_at),
             raw_payload   = coalesce(p_raw_payload, raw_payload),
             invoice_id    = p_invoice_id,
             invoice_tenant_id = p_tenant_id
       where id = v_existing;
      if v_existing_ct is not null then
        -- Already applied to the balance — nothing more to do.
        return v_existing;
      end if;
      v_pr_id := v_existing;  -- exists but never counted: fall through to apply.
    end if;
  end if;

  -- New ledger row (manual payment, or first sight of this provider payment).
  if v_pr_id is null then
    insert into public.payment_records (
      tenant_id, provider, provider_payment_id,
      amount_cents, currency, method, mollie_status,
      paid_at, raw_payload, invoice_id, invoice_tenant_id, description
    ) values (
      p_tenant_id, v_provider, p_provider_payment_id,
      p_amount_cents, v_currency, p_method,
      case when v_provider = 'mollie' then coalesce(p_raw_payload->>'status', 'paid') else null end,
      coalesce(p_paid_at, now()), coalesce(p_raw_payload, '{}'::jsonb),
      p_invoice_id, p_tenant_id, nullif(trim(coalesce(p_note, '')), '')
    )
    returning id into v_pr_id;
  end if;

  v_new_paid := v_paid + p_amount_cents;

  -- Overpayment is only guarded for manual entry (where a human types the
  -- amount). Provider amounts are created server-side against the remaining
  -- balance, so they cannot overpay.
  if v_provider = 'manual' and v_new_paid > v_total then
    raise exception 'payment of % would exceed remaining balance (% of % paid)',
      p_amount_cents, v_paid, v_total;
  end if;

  update public.payment_records
     set counted_at = now()
   where id = v_pr_id;

  v_fully_paid := v_new_paid >= v_total;

  update public.invoices
     set amount_paid_cents = v_new_paid,
         status  = case when v_fully_paid and v_status = 'open' then 'paid'::public.invoice_status else status end,
         paid_at = case when v_fully_paid and v_status = 'open' then coalesce(p_paid_at, now()) else paid_at end,
         payment_record_id        = case when v_fully_paid then v_pr_id else payment_record_id end,
         payment_record_tenant_id = case when v_fully_paid then p_tenant_id else payment_record_tenant_id end
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when v_fully_paid and v_status = 'open'
      then (case when v_provider = 'mollie' then 'invoice.paid_via_mollie' else 'invoice.paid' end)
      else 'invoice.payment_recorded'
    end,
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'payment_record_id', v_pr_id,
      'provider', v_provider,
      'provider_payment_id', p_provider_payment_id,
      'method', p_method,
      'amount_cents', p_amount_cents,
      'amount_paid_cents', v_new_paid,
      'total_cents', v_total,
      'partial', not v_fully_paid,
      'fully_paid', v_fully_paid
    )
  );

  -- Termijn-tegoed: a now fully-paid installment releases its tegoed-deel
  -- (no-op for non-installments / immediate plans / money-only schemas).
  if v_fully_paid and v_status = 'open' and v_plan is not null then
    perform public.release_installment_credit(p_tenant_id, p_actor, p_invoice_id);
  end if;

  return v_pr_id;
end;
$$;

revoke all on function public.record_invoice_payment(uuid, uuid, uuid, integer, text, text, text, text, timestamptz, text, jsonb) from public;
revoke execute on function public.record_invoice_payment(uuid, uuid, uuid, integer, text, text, text, text, timestamptz, text, jsonb) from anon, authenticated;
grant execute on function public.record_invoice_payment(uuid, uuid, uuid, integer, text, text, text, text, timestamptz, text, jsonb) to service_role;

-- ===========================================================================
-- 4. confirm_mollie_payment — reworked to record partial Mollie payments.
--    On status='paid' it now delegates the money side to record_invoice_payment
--    (which accumulates and only flips to paid once fully covered), instead of
--    rejecting amount < total. Non-paid statuses just track mollie_status.
-- ===========================================================================
create or replace function public.confirm_mollie_payment(
  p_tenant_id          uuid,
  p_actor              uuid,
  p_invoice_id         uuid,
  p_mollie_payment_id  text,
  p_status             text,
  p_amount_cents       integer,
  p_currency           text,
  p_method             text,
  p_paid_at            timestamptz,
  p_raw_payload        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_status     public.invoice_status;
  v_invoice_kind       text;
  v_pr_id              uuid;
  v_mismatch_reason    text := null;
begin
  if p_tenant_id is null or p_invoice_id is null or p_mollie_payment_id is null then
    raise exception 'tenant_id, invoice_id and mollie_payment_id are required';
  end if;

  select status, kind
    into v_invoice_status, v_invoice_kind
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'invoice % not found in tenant % (cross-tenant webhook rejected)',
      p_invoice_id, p_tenant_id;
  end if;

  -- Always reflect the latest Mollie status on the invoice.
  update public.invoices
     set mollie_status = p_status
   where id = p_invoice_id and tenant_id = p_tenant_id;

  if p_status = 'paid' and v_invoice_status = 'open' and v_invoice_kind = 'invoice' then
    if coalesce(p_currency, 'EUR') <> 'EUR' then
      v_mismatch_reason := 'currency mismatch (' || coalesce(p_currency, '<null>') || ')';
    elsif p_amount_cents is null or p_amount_cents <= 0 then
      v_mismatch_reason := 'non-positive amount (' || coalesce(p_amount_cents::text, '<null>') || ')';
    else
      -- Record the (possibly partial) Mollie payment. record_invoice_payment
      -- is idempotent on the mollie payment id, accumulates the balance and
      -- flips the invoice to paid (+ releases tegoed) once fully covered. It
      -- writes its own audit_log entry, so we return here.
      v_pr_id := public.record_invoice_payment(
        p_tenant_id, p_actor, p_invoice_id, p_amount_cents,
        coalesce(p_method, 'mollie'), 'mollie', p_mollie_payment_id,
        coalesce(p_currency, 'EUR'), p_paid_at, null,
        coalesce(p_raw_payload, '{}'::jsonb)
      );
      return v_pr_id;
    end if;
  end if;

  -- Non-paid status, or a mismatch on a paid webhook: just audit the receipt.
  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case
      when v_mismatch_reason is not null then 'invoice.mollie_payment_mismatch'
      else 'invoice.mollie_webhook_received'
    end,
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'mollie_payment_id', p_mollie_payment_id,
      'mollie_status', p_status,
      'amount_cents', p_amount_cents,
      'currency', coalesce(p_currency, 'EUR'),
      'method', p_method,
      'mismatch_reason', v_mismatch_reason
    )
  );

  return null;
end;
$$;

revoke all on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from public;
revoke execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from anon, authenticated;
grant execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) to service_role;

-- ===========================================================================
-- 5. set_invoice_status — the manual "mark as paid" shortcut now also syncs
--    amount_paid_cents := total_cents so the partial-payment view agrees.
--    Body mirrors 0075 with the amount_paid sync added on the paid transition.
-- ===========================================================================
create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_status     public.invoice_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current  public.invoice_status;
  v_lines    integer;
  v_issued   timestamptz;
  v_paid     timestamptz;
  v_plan     uuid;
  v_total    integer;
begin
  select status, installment_plan_id, total_cents
    into v_current, v_plan, v_total
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if v_current is null then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_current = p_status then
    return;
  end if;

  -- Legal transitions:
  --   draft → open | cancelled
  --   open  → paid | cancelled
  if not (
    (v_current = 'draft' and p_status in ('open', 'cancelled'))
    or (v_current = 'open'  and p_status in ('paid', 'cancelled'))
  ) then
    raise exception 'illegal invoice status transition % → %', v_current, p_status;
  end if;

  if p_status = 'open' then
    select count(*) into v_lines from public.invoice_lines where invoice_id = p_invoice_id;
    if v_lines = 0 then
      raise exception 'cannot open an invoice without lines';
    end if;
    v_issued := now();
  end if;

  if p_status = 'paid' then
    v_paid := now();
  end if;

  update public.invoices
     set status    = p_status,
         issued_at = coalesce(v_issued, issued_at),
         paid_at   = coalesce(v_paid,   paid_at),
         amount_paid_cents = case
           when p_status = 'paid' and total_cents > 0 then total_cents
           else amount_paid_cents
         end
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.status_changed', 'invoice', p_invoice_id::text,
    jsonb_build_object('from', v_current::text, 'to', p_status::text)
  );

  -- Termijn-tegoed: a paid installment releases its proportional tegoed-deel
  -- (no-op for non-installments / immediate plans / money-only schemas).
  if p_status = 'paid' and v_plan is not null then
    perform public.release_installment_credit(p_tenant_id, p_actor, p_invoice_id);
  end if;
end;
$$;

revoke all on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from public;
revoke execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from anon, authenticated;
grant execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) to service_role;
