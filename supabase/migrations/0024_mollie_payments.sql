-- 0024_mollie_payments.sql
-- Task #15 — Mollie online payments for invoices.
--
-- Changes:
--   * Renames the payment_records_stub placeholder to payment_records and
--     extends it with Mollie-specific columns. Existing FKs and indexes are
--     renamed/recreated on the new name.
--   * Adds mollie_payment_id / mollie_checkout_url / mollie_status to invoices
--     with a tenant-scoped partial unique on the mollie payment id (so a
--     duplicate webhook delivery cannot accidentally attach the same payment
--     to two invoices). Also adds an index for tenant-scoped lookup by
--     mollie_payment_id (used by the webhook).
--   * New `tenant_secrets` table — encrypted-at-rest per-tenant secrets
--     (initially: 'mollie_api_key'). Service-role only; no RLS policies for
--     users so the encrypted ciphertext is invisible to anon/authenticated
--     JWTs even with the public-anon Supabase key.
--   * SECURITY DEFINER RPCs (service_role only):
--       - set_tenant_secret(...)               — upsert + audit
--       - attach_mollie_payment_to_invoice(...) — store payment ids on invoice
--       - confirm_mollie_payment(...)          — idempotent webhook handler:
--           upserts payment_records, links it to the invoice, and on
--           status='paid' transitions the invoice to paid + audits.

-- ---------------------------------------------------------------------------
-- 1. Rename payment_records_stub → payment_records  (idempotent guard)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'payment_records_stub'
  ) and not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'payment_records'
  ) then
    alter table public.payment_records_stub rename to payment_records;
  end if;
end $$;

-- Rename pre-existing constraint / index / policy if they still carry the
-- old "stub" name. Guarded so reapplying is safe.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'payment_records_stub_id_tenant_unique'
  ) then
    alter table public.payment_records
      rename constraint payment_records_stub_id_tenant_unique
      to payment_records_id_tenant_unique;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class
     where relname = 'idx_payment_records_stub_tenant_created'
       and relkind = 'i'
  ) then
    alter index public.idx_payment_records_stub_tenant_created
      rename to idx_payment_records_tenant_created;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policy
     where polname = 'payment_records_stub_select_admin'
  ) then
    execute 'drop policy payment_records_stub_select_admin on public.payment_records';
  end if;
end $$;

drop policy if exists payment_records_select_admin on public.payment_records;
create policy payment_records_select_admin on public.payment_records
  for select
  using (
    public.is_platform_admin()
    or public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'instructor')
  );
-- no insert/update/delete policies — service-role only

-- ---------------------------------------------------------------------------
-- 2. Extend payment_records with Mollie columns
-- ---------------------------------------------------------------------------
alter table public.payment_records
  add column if not exists mollie_status text,
  add column if not exists currency      text not null default 'EUR',
  add column if not exists method        text,
  add column if not exists description   text,
  add column if not exists invoice_id    uuid,
  add column if not exists invoice_tenant_id uuid,
  add column if not exists updated_at    timestamptz not null default now();

drop trigger if exists payment_records_set_updated_at on public.payment_records;
create trigger payment_records_set_updated_at
  before update on public.payment_records
  for each row execute function public.set_updated_at();

-- Idempotency anchor for the webhook: a given Mollie payment id is unique
-- within a tenant. (Different tenants have different Mollie accounts and
-- therefore their own id namespaces, but we still scope by tenant_id to
-- defend against cross-tenant webhook spoofing.)
create unique index if not exists payment_records_tenant_mollie_id_unique
  on public.payment_records (tenant_id, provider_payment_id)
  where provider_payment_id is not null;

-- Cross-tenant safety: payment_records.invoice_id must belong to the same
-- tenant as the payment_record. Composite FK matching the invoices side.
alter table public.payment_records
  drop constraint if exists payment_records_invoice_fkey;
alter table public.payment_records
  add constraint payment_records_invoice_fkey
  foreign key (invoice_id, invoice_tenant_id)
  references public.invoices (id, tenant_id)
  on delete set null;

-- Note: invoices(id, tenant_id) already has the unique constraint
-- `invoices_id_tenant_unique` from migration 0019, which is what the
-- payment_records_invoice_fkey above references. No change needed here.

-- ---------------------------------------------------------------------------
-- 3. Add Mollie columns to invoices
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists mollie_payment_id  text,
  add column if not exists mollie_checkout_url text,
  add column if not exists mollie_status      text;

create unique index if not exists invoices_tenant_mollie_payment_id_unique
  on public.invoices (tenant_id, mollie_payment_id)
  where mollie_payment_id is not null;

create index if not exists idx_invoices_tenant_mollie_payment_id
  on public.invoices (tenant_id, mollie_payment_id)
  where mollie_payment_id is not null;

-- ---------------------------------------------------------------------------
-- 4. tenant_secrets — encrypted-at-rest per-tenant secrets
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_secrets (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null,
  ciphertext  text not null,   -- base64
  iv          text not null,   -- base64
  auth_tag    text not null,   -- base64 (AES-256-GCM tag)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, key),
  check (char_length(ciphertext) <= 8192),
  check (char_length(iv) <= 64),
  check (char_length(auth_tag) <= 64)
);

drop trigger if exists tenant_secrets_set_updated_at on public.tenant_secrets;
create trigger tenant_secrets_set_updated_at
  before update on public.tenant_secrets
  for each row execute function public.set_updated_at();

alter table public.tenant_secrets enable row level security;
-- No policies. Service-role only. anon/authenticated cannot see this table
-- at all, which is exactly what we want for an encrypted key blob.

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------

-- set_tenant_secret: upserts an encrypted blob and audits.
create or replace function public.set_tenant_secret(
  p_tenant_id   uuid,
  p_actor       uuid,
  p_key         text,
  p_ciphertext  text,
  p_iv          text,
  p_auth_tag    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existed boolean;
begin
  if p_tenant_id is null or p_actor is null or p_key is null then
    raise exception 'tenant_id, actor and key are required';
  end if;
  if length(trim(coalesce(p_ciphertext,''))) = 0 then
    raise exception 'ciphertext is required';
  end if;

  select exists(
    select 1 from public.tenant_secrets
     where tenant_id = p_tenant_id and key = p_key
  ) into v_existed;

  insert into public.tenant_secrets (tenant_id, key, ciphertext, iv, auth_tag)
  values (p_tenant_id, p_key, p_ciphertext, p_iv, p_auth_tag)
  on conflict (tenant_id, key)
    do update set
      ciphertext = excluded.ciphertext,
      iv         = excluded.iv,
      auth_tag   = excluded.auth_tag,
      updated_at = now();

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when v_existed then 'tenant_secret.rotated' else 'tenant_secret.created' end,
    'tenant_secret', p_key,
    jsonb_build_object('key', p_key)
  );
end;
$$;

revoke all on function public.set_tenant_secret(uuid, uuid, text, text, text, text) from public;
revoke execute on function public.set_tenant_secret(uuid, uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.set_tenant_secret(uuid, uuid, text, text, text, text) to service_role;

-- attach_mollie_payment_to_invoice: records that a Mollie payment object has
-- been created for this invoice. Only valid while the invoice is 'open'.
create or replace function public.attach_mollie_payment_to_invoice(
  p_invoice_id        uuid,
  p_tenant_id         uuid,
  p_actor             uuid,
  p_mollie_payment_id text,
  p_checkout_url      text,
  p_status            text
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
         mollie_status       = p_status
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.mollie_payment_attached',
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'mollie_payment_id', p_mollie_payment_id,
      'mollie_status', p_status
    )
  );
end;
$$;

revoke all on function public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text) from public;
revoke execute on function public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text) from anon, authenticated;
grant execute on function public.attach_mollie_payment_to_invoice(uuid, uuid, uuid, text, text, text) to service_role;

-- confirm_mollie_payment: idempotent webhook ingestion. Always upserts the
-- payment_records row (keyed on tenant + mollie payment id). When the
-- reported Mollie status is 'paid' and the invoice is still 'open', it
-- atomically transitions the invoice to 'paid' and links the payment_record.
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
  v_invoice_status public.invoice_status;
  v_invoice_total  integer;
  v_pr_id          uuid;
  v_was_paid       boolean := false;
begin
  if p_tenant_id is null or p_invoice_id is null or p_mollie_payment_id is null then
    raise exception 'tenant_id, invoice_id and mollie_payment_id are required';
  end if;

  -- Verify the invoice belongs to this tenant. Lock row.
  select status, total_cents
    into v_invoice_status, v_invoice_total
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'invoice % not found in tenant % (cross-tenant webhook rejected)',
      p_invoice_id, p_tenant_id;
  end if;

  -- Upsert payment_records keyed on (tenant_id, provider_payment_id).
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

  -- Always keep mollie_status on the invoice in sync.
  update public.invoices
     set mollie_status = p_status
   where id = p_invoice_id and tenant_id = p_tenant_id;

  -- Only on first transition to 'paid' do we flip the invoice + audit it.
  if p_status = 'paid' and v_invoice_status = 'open' then
    update public.invoices
       set status            = 'paid',
           paid_at           = coalesce(p_paid_at, now()),
           payment_record_id        = v_pr_id,
           payment_record_tenant_id = p_tenant_id
     where id = p_invoice_id and tenant_id = p_tenant_id;
    v_was_paid := true;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when v_was_paid then 'invoice.paid_via_mollie' else 'invoice.mollie_webhook_received' end,
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'mollie_payment_id', p_mollie_payment_id,
      'mollie_status', p_status,
      'amount_cents', p_amount_cents,
      'currency', coalesce(p_currency,'EUR'),
      'method', p_method,
      'payment_record_id', v_pr_id
    )
  );

  return v_pr_id;
end;
$$;

revoke all on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from public;
revoke execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from anon, authenticated;
grant execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) to service_role;
