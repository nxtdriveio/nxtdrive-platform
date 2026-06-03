-- 0083_partial_payments_overpay_guard.sql
-- Task #133 follow-up — close the partial-payment overpayment hole.
--
-- 0082 trusted that PROVIDER (Mollie) payments are always created against the
-- remaining balance and therefore cannot overpay, so the overpay guard in
-- record_invoice_payment only applied to manual entries. That assumption breaks
-- once an invoice can carry several Mollie links over its lifetime: a school can
-- generate a second link (or a student can pay an older still-open link) while
-- the invoice is already partly paid, so two individually-valid Mollie payments
-- can cumulatively exceed the remaining balance. That would inflate
-- invoices.amount_paid_cents above total_cents and mark the invoice paid with an
-- overstated paid amount.
--
-- This migration hardens the money core on two fronts:
--   1. record_invoice_payment now caps invoices.amount_paid_cents at total_cents
--      for ALL providers (the payment_records ledger row keeps the true amount —
--      the cap is on the cached invoice balance, never on the ledger). Manual
--      overpay still hard-raises (admin gets immediate feedback). Provider
--      overpay is recorded + flagged via an 'invoice.overpayment_detected' audit
--      entry instead of raising — raising inside the webhook would make Mollie
--      retry forever while real money stays unrecorded.
--   2. attach_mollie_payment_to_invoice persists the attached link's intended
--      amount (invoices.mollie_amount_cents) so the checkout helper can safely
--      RE-USE an existing open/pending link for the same invoice+amount instead
--      of spawning duplicate active links.

-- ===========================================================================
-- 1. invoices.mollie_amount_cents — intended amount of the currently-attached
--    Mollie checkout link (for safe checkout reuse / duplicate-link avoidance).
-- ===========================================================================
alter table public.invoices
  add column if not exists mollie_amount_cents integer;

-- ===========================================================================
-- 2. attach_mollie_payment_to_invoice — now records the link amount too.
--    The old 6-arg signature is dropped; the only caller passes the amount.
-- ===========================================================================
drop function if exists public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text);

create or replace function public.attach_mollie_payment_to_invoice(
  p_invoice_id        uuid,
  p_tenant_id         uuid,
  p_actor             uuid,
  p_mollie_payment_id text,
  p_checkout_url      text,
  p_status            text,
  p_amount_cents      integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.invoice_status;
begin
  if p_invoice_id is null or p_tenant_id is null or p_mollie_payment_id is null then
    raise exception 'invoice_id, tenant_id and mollie_payment_id are required';
  end if;

  select status into v_status
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_status <> 'open' then
    raise exception 'cannot attach Mollie payment to invoice in status %', v_status;
  end if;

  update public.invoices
     set mollie_payment_id   = p_mollie_payment_id,
         mollie_checkout_url = p_checkout_url,
         mollie_status       = p_status,
         mollie_amount_cents = p_amount_cents
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.mollie_payment_attached',
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'mollie_payment_id', p_mollie_payment_id,
      'mollie_status', p_status,
      'amount_cents', p_amount_cents
    )
  );
end;
$$;

revoke all on function public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text, integer) from public;
revoke execute on function public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text, integer) from anon, authenticated;
grant execute on function public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text, integer) to service_role;

-- ===========================================================================
-- 3. record_invoice_payment — cap the cached invoice balance at total for ALL
--    providers; flag (don't raise) provider overpayment; manual still raises.
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
  v_applied     integer;
  v_overpaid    boolean := false;
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
  v_overpaid := v_new_paid > v_total;

  -- Manual overpay is rejected outright (a human typed the amount and should be
  -- told). Provider overpay is recorded + flagged below — never silently lost.
  if v_overpaid and v_provider = 'manual' then
    raise exception 'payment of % would exceed remaining balance (% of % paid)',
      p_amount_cents, v_paid, v_total;
  end if;

  -- The payment_records ledger keeps the true amount; the cached invoice balance
  -- is capped at total so amount_paid_cents can never exceed total_cents.
  v_applied := least(v_new_paid, v_total);

  update public.payment_records
     set counted_at = now()
   where id = v_pr_id;

  v_fully_paid := v_new_paid >= v_total;

  update public.invoices
     set amount_paid_cents = v_applied,
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
      'amount_paid_cents', v_applied,
      'total_cents', v_total,
      'partial', not v_fully_paid,
      'fully_paid', v_fully_paid,
      'overpaid', v_overpaid
    )
  );

  -- Surface a provider overpayment as its own audit event so staff can issue a
  -- refund / credit note. (Manual overpay never reaches here — it raised above.)
  if v_overpaid then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'invoice.overpayment_detected',
      'invoice', p_invoice_id::text,
      jsonb_build_object(
        'payment_record_id', v_pr_id,
        'provider', v_provider,
        'provider_payment_id', p_provider_payment_id,
        'total_cents', v_total,
        'overpaid_by_cents', v_new_paid - v_total
      )
    );
  end if;

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
