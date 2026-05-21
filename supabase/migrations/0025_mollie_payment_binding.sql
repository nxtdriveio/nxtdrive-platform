-- ============================================================================
-- 0025_mollie_payment_binding.sql
--
-- Hardens confirm_mollie_payment with strict binding + amount checks before
-- flipping an invoice to 'paid'. Addresses two integrity gaps in 0024:
--   1) An invoice could be flipped paid by a webhook whose metadata happens
--      to point at it even if the invoice was never attached to that Mollie
--      payment id (no binding check).
--   2) An invoice could be flipped paid for an amount lower than its total
--      or in a non-EUR currency (no amount/currency check).
--
-- Behaviour after this migration:
--   - The function still ALWAYS upserts payment_records and keeps
--     invoices.mollie_status in sync — those are pure observability.
--   - The 'open → paid' transition only happens when ALL of:
--       * Mollie reports status = 'paid'
--       * Invoice is currently 'open'
--       * Invoice's stored mollie_payment_id matches p_mollie_payment_id
--       * Reported amount in cents >= invoice.total_cents
--       * Reported currency = 'EUR'
--   - When the status is paid but binding/amount/currency don't match, we
--     emit an `invoice.mollie_payment_mismatch` audit entry instead of the
--     paid transition. The webhook receiver continues to return 200 in that
--     case (it's not a retryable error, it's a real integrity decision).
-- ============================================================================

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
  v_invoice_total      integer;
  v_invoice_mollie_id  text;
  v_pr_id              uuid;
  v_was_paid           boolean := false;
  v_mismatch_reason    text := null;
begin
  if p_tenant_id is null or p_invoice_id is null or p_mollie_payment_id is null then
    raise exception 'tenant_id, invoice_id and mollie_payment_id are required';
  end if;

  -- Verify the invoice belongs to this tenant. Lock the row to prevent
  -- concurrent webhook deliveries from racing each other.
  select status, total_cents, mollie_payment_id
    into v_invoice_status, v_invoice_total, v_invoice_mollie_id
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'invoice % not found in tenant % (cross-tenant webhook rejected)',
      p_invoice_id, p_tenant_id;
  end if;

  -- Upsert payment_records — always, even on mismatch (so we have a paper
  -- trail of every Mollie status callback we processed).
  insert into public.payment_records (
    tenant_id, provider, provider_payment_id,
    amount_cents, currency, method, mollie_status,
    paid_at, raw_payload, invoice_id, invoice_tenant_id
  ) values (
    p_tenant_id, 'mollie', p_mollie_payment_id,
    p_amount_cents, coalesce(p_currency,'EUR'), p_method, p_status,
    p_paid_at, coalesce(p_raw_payload,'{}'::jsonb), p_invoice_id, p_tenant_id
  )
  on conflict (tenant_id, provider_payment_id) where provider_payment_id is not null
    do update set
      amount_cents      = excluded.amount_cents,
      currency          = excluded.currency,
      method            = excluded.method,
      mollie_status     = excluded.mollie_status,
      paid_at           = excluded.paid_at,
      raw_payload       = excluded.raw_payload,
      invoice_id        = excluded.invoice_id,
      invoice_tenant_id = excluded.invoice_tenant_id
  returning id into v_pr_id;

  -- Keep mollie_status on the invoice in sync regardless of mismatch — it's
  -- a passive observability field.
  update public.invoices
     set mollie_status = p_status
   where id = p_invoice_id and tenant_id = p_tenant_id;

  -- Decide whether this paid callback is actually allowed to flip the
  -- invoice. Skipping any of these = mismatch, NOT a retry.
  if p_status = 'paid' and v_invoice_status = 'open' then
    if v_invoice_mollie_id is null
       or v_invoice_mollie_id <> p_mollie_payment_id then
      v_mismatch_reason := 'mollie_payment_id binding mismatch';
    elsif coalesce(p_currency,'EUR') <> 'EUR' then
      v_mismatch_reason := 'currency mismatch (' || coalesce(p_currency,'<null>') || ')';
    elsif p_amount_cents is null or p_amount_cents < v_invoice_total then
      v_mismatch_reason := 'amount_cents ' || coalesce(p_amount_cents::text, '<null>')
                         || ' < invoice total ' || v_invoice_total::text;
    else
      update public.invoices
         set status            = 'paid',
             paid_at           = coalesce(p_paid_at, now()),
             payment_record_id        = v_pr_id,
             payment_record_tenant_id = p_tenant_id
       where id = p_invoice_id and tenant_id = p_tenant_id;
      v_was_paid := true;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case
      when v_was_paid then 'invoice.paid_via_mollie'
      when v_mismatch_reason is not null then 'invoice.mollie_payment_mismatch'
      else 'invoice.mollie_webhook_received'
    end,
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'mollie_payment_id', p_mollie_payment_id,
      'mollie_status', p_status,
      'amount_cents', p_amount_cents,
      'currency', coalesce(p_currency,'EUR'),
      'method', p_method,
      'payment_record_id', v_pr_id,
      'mismatch_reason', v_mismatch_reason
    )
  );

  return v_pr_id;
end;
$$;

-- Re-assert the grant lockdown (security definer functions inherit nothing
-- from the previous version's grants on `create or replace`).
revoke all on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from public;
revoke execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from anon, authenticated;
grant execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) to service_role;
