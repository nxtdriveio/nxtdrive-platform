-- 0084_payment_ledger_completeness.sql
-- Task #133 follow-up — make the payment ledger complete on every money path.
--
-- Two gaps remained after 0082/0083:
--
--   1. confirm_mollie_payment only funnelled a paid Mollie callback into
--      record_invoice_payment when the invoice was still 'open'. A late callback
--      on an ALREADY-PAID invoice (e.g. a stale second checkout link paid after
--      the invoice was settled by another link) was only audited, never recorded
--      in payment_records — real money missing from the ledger. record_invoice_
--      payment already accepts 'paid' invoices (it records + flags the overpay)
--      and is idempotent per provider_payment_id, so we now delegate for any
--      paid callback regardless of invoice status.
--
--   2. set_invoice_status open->paid set invoices.amount_paid_cents := total
--      directly, mutating the balance WITHOUT a payment_records ledger entry —
--      violating "no financial balance mutation without a ledger entry + audit".
--      The manual "mark as paid" shortcut now routes the outstanding remainder
--      through record_invoice_payment (provider='manual', method='manual_mark_
--      paid'), which writes the ledger row, flips the status, stamps paid_at and
--      releases installment tegoed. Credit notes (kind <> 'invoice') keep the
--      legacy direct flip — they carry no money balance to ledger.

-- ===========================================================================
-- 1. confirm_mollie_payment — record paid callbacks on open OR paid invoices.
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

  -- Any paid callback on an invoice (open OR already paid) must hit the ledger.
  -- record_invoice_payment accumulates + caps the balance, flips to paid once
  -- covered, flags overpay for late/duplicate links, and is idempotent on the
  -- Mollie payment id. It writes its own audit_log entry, so we return here.
  if p_status = 'paid' and v_invoice_status in ('open', 'paid') and v_invoice_kind = 'invoice' then
    if coalesce(p_currency, 'EUR') <> 'EUR' then
      v_mismatch_reason := 'currency mismatch (' || coalesce(p_currency, '<null>') || ')';
    elsif p_amount_cents is null or p_amount_cents <= 0 then
      v_mismatch_reason := 'non-positive amount (' || coalesce(p_amount_cents::text, '<null>') || ')';
    else
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
-- 2. set_invoice_status — the manual "mark as paid" shortcut now writes a
--    payment_records ledger entry (via record_invoice_payment) for invoices.
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
  v_current   public.invoice_status;
  v_kind      text;
  v_lines     integer;
  v_plan      uuid;
  v_total     integer;
  v_paid      integer;
  v_remaining integer;
begin
  select status, kind, installment_plan_id, total_cents, amount_paid_cents
    into v_current, v_kind, v_plan, v_total, v_paid
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

  -- draft → open: require lines, stamp issued_at.
  if p_status = 'open' then
    select count(*) into v_lines from public.invoice_lines where invoice_id = p_invoice_id;
    if v_lines = 0 then
      raise exception 'cannot open an invoice without lines';
    end if;
    update public.invoices
       set status = 'open', issued_at = now()
     where id = p_invoice_id and tenant_id = p_tenant_id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'invoice.status_changed', 'invoice', p_invoice_id::text,
      jsonb_build_object('from', v_current::text, 'to', p_status::text)
    );
    return;
  end if;

  -- → cancelled: straight flip.
  if p_status = 'cancelled' then
    update public.invoices
       set status = 'cancelled'
     where id = p_invoice_id and tenant_id = p_tenant_id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'invoice.status_changed', 'invoice', p_invoice_id::text,
      jsonb_build_object('from', v_current::text, 'to', p_status::text)
    );
    return;
  end if;

  -- open → paid. Log the transition for history, then settle the balance.
  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.status_changed', 'invoice', p_invoice_id::text,
    jsonb_build_object('from', v_current::text, 'to', p_status::text)
  );

  v_remaining := v_total - coalesce(v_paid, 0);

  if v_kind = 'invoice' and v_remaining > 0 then
    -- Ledger-backed settle: record_invoice_payment writes the payment_records
    -- row + its own audit, flips status → paid, stamps paid_at and releases
    -- installment tegoed. (No balance mutation without a ledger entry.)
    perform public.record_invoice_payment(
      p_tenant_id, p_actor, p_invoice_id, v_remaining,
      'manual_mark_paid', 'manual', null, 'EUR', now(), null, null
    );
  else
    -- Credit note, or an invoice already fully covered: just flip the status
    -- (no money balance to ledger).
    update public.invoices
       set status = 'paid', paid_at = now()
     where id = p_invoice_id and tenant_id = p_tenant_id;
    if v_plan is not null then
      perform public.release_installment_credit(p_tenant_id, p_actor, p_invoice_id);
    end if;
  end if;
end;
$$;

revoke all on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from public;
revoke execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from anon, authenticated;
grant execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) to service_role;
