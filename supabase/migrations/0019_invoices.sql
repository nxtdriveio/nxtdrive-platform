-- 0019_invoices.sql
-- Phase 3 — Facturen basis (Invoices MVP)
--
-- Adds the invoicing data model + insert-only audit RPCs. Mirrors the
-- credit_ledger pattern: all mutations go through SECURITY DEFINER RPCs
-- granted only to service_role, paired with audit_log inserts.
--
-- Tables:
--   * invoice_counters     — per-tenant monotonic invoice_no
--   * payment_records_stub — placeholder for future Mollie payment data
--   * invoices             — header rows, status machine
--   * invoice_lines        — line items, recalculated on every mutation
--
-- Status machine (enforced in set_invoice_status):
--   draft → open  (requires ≥1 line; sets issued_at)
--   open  → paid  (sets paid_at)
--   open  → cancelled
--   draft → cancelled
-- 'overdue' is derived in the UI: status='open' AND due_date < today.

-- enum --------------------------------------------------------------------
do $$ begin
  create type public.invoice_status as enum (
    'draft',
    'open',
    'paid',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- counter -----------------------------------------------------------------
create table if not exists public.invoice_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_no   integer not null default 1
);

alter table public.invoice_counters enable row level security;
-- no policies: service-role only

-- payment_records_stub ----------------------------------------------------
-- Empty in MVP. Exists so invoices.payment_record_id has a real target and
-- a future Mollie integration can write here without a schema migration.
create table if not exists public.payment_records_stub (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  provider            text not null,
  provider_payment_id text,
  paid_at             timestamptz,
  amount_cents        integer,
  raw_payload         jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  check (amount_cents is null or amount_cents >= 0)
);

create index if not exists idx_payment_records_stub_tenant_created
  on public.payment_records_stub (tenant_id, created_at desc);

alter table public.payment_records_stub
  drop constraint if exists payment_records_stub_id_tenant_unique;
alter table public.payment_records_stub
  add constraint payment_records_stub_id_tenant_unique unique (id, tenant_id);

alter table public.payment_records_stub enable row level security;

drop policy if exists payment_records_stub_select_admin on public.payment_records_stub;
create policy payment_records_stub_select_admin on public.payment_records_stub
  for select
  using (
    public.is_platform_admin()
    or public.has_role(tenant_id, 'tenant_admin')
  );
-- no insert/update/delete policies — service role only

-- invoices ----------------------------------------------------------------
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  student_id         uuid not null,
  invoice_no         integer not null,
  status             public.invoice_status not null default 'draft',
  issued_at          timestamptz,
  due_date           date,
  paid_at            timestamptz,
  subtotal_cents     integer not null default 0,
  tax_cents          integer not null default 0,
  total_cents        integer not null default 0,
  notes              text,
  payment_record_id  uuid,
  payment_record_tenant_id uuid,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (subtotal_cents >= 0),
  check (tax_cents >= 0),
  check (total_cents >= 0),
  check (notes is null or char_length(notes) <= 2000),
  constraint invoices_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete restrict,
  constraint invoices_payment_record_fkey
    foreign key (payment_record_id, payment_record_tenant_id)
    references public.payment_records_stub (id, tenant_id)
    on delete set null,
  constraint invoices_no_per_tenant_unique unique (tenant_id, invoice_no)
);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index if not exists idx_invoices_tenant_status
  on public.invoices (tenant_id, status);
create index if not exists idx_invoices_tenant_due_date
  on public.invoices (tenant_id, due_date);
create index if not exists idx_invoices_student_created
  on public.invoices (student_id, created_at desc);

alter table public.invoices
  drop constraint if exists invoices_id_tenant_unique;
alter table public.invoices
  add constraint invoices_id_tenant_unique unique (id, tenant_id);

-- invoice_lines -----------------------------------------------------------
create table if not exists public.invoice_lines (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  description        text not null,
  quantity           numeric(10,2) not null default 1,
  unit_price_cents   integer not null,
  tax_rate_bp        integer not null default 2100,
  amount_cents       integer not null,
  tax_amount_cents   integer not null,
  related_package_id uuid,
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  check (quantity > 0),
  check (tax_rate_bp >= 0 and tax_rate_bp <= 10000),
  check (char_length(description) between 1 and 500),
  constraint invoice_lines_invoice_tenant_fkey
    foreign key (invoice_id, tenant_id)
    references public.invoices (id, tenant_id)
    on delete cascade,
  constraint invoice_lines_package_tenant_fkey
    foreign key (related_package_id, tenant_id)
    references public.packages (id, tenant_id)
    on delete set null
);

create index if not exists idx_invoice_lines_invoice_position
  on public.invoice_lines (invoice_id, position);
create index if not exists idx_invoice_lines_tenant
  on public.invoice_lines (tenant_id);

-- RLS ---------------------------------------------------------------------
alter table public.invoices       enable row level security;
alter table public.invoice_lines  enable row level security;

-- Invoices: tenant_admin + instructor see all in tenant.
-- Student sees only own non-draft invoices via students.user_id.
drop policy if exists invoices_select_members on public.invoices;
create policy invoices_select_members on public.invoices
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = invoices.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or (
      status <> 'draft'
      and student_id in (
        select s.id
          from public.students s
         where s.user_id   = auth.uid()
           and s.tenant_id = invoices.tenant_id
      )
    )
  );

-- Invoice lines: same visibility as parent invoice.
drop policy if exists invoice_lines_select_members on public.invoice_lines;
create policy invoice_lines_select_members on public.invoice_lines
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = invoice_lines.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1
        from public.invoices i
        join public.students s
          on s.id = i.student_id and s.tenant_id = i.tenant_id
       where i.id = invoice_lines.invoice_id
         and i.tenant_id = invoice_lines.tenant_id
         and i.status <> 'draft'
         and s.user_id = auth.uid()
    )
  );

-- No insert/update/delete policies on either table — service role only.

-- ------------------------------------------------------------------------
-- Internal helper: recompute totals on the invoice row from its lines.
-- ------------------------------------------------------------------------
create or replace function public._recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal integer;
  v_tax      integer;
begin
  select
    coalesce(sum(amount_cents), 0)::integer,
    coalesce(sum(tax_amount_cents), 0)::integer
    into v_subtotal, v_tax
    from public.invoice_lines
   where invoice_id = p_invoice_id;

  update public.invoices
     set subtotal_cents = v_subtotal,
         tax_cents      = v_tax,
         total_cents    = v_subtotal + v_tax
   where id = p_invoice_id;
end;
$$;

revoke all on function public._recalc_invoice_totals(uuid) from public;
grant execute on function public._recalc_invoice_totals(uuid) to service_role;

-- ------------------------------------------------------------------------
-- RPC: create_invoice — opens a draft invoice for a student.
-- ------------------------------------------------------------------------
create or replace function public.create_invoice(
  p_tenant_id  uuid,
  p_actor      uuid,
  p_student_id uuid,
  p_due_date   date,
  p_notes      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_no         integer;
begin
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Reserve next invoice_no atomically. The INSERT ON CONFLICT ensures the
  -- counter row exists; the UPDATE then increments it under a row lock.
  insert into public.invoice_counters (tenant_id, next_no)
    values (p_tenant_id, 1)
    on conflict (tenant_id) do nothing;
  update public.invoice_counters
     set next_no = next_no + 1
   where tenant_id = p_tenant_id
   returning next_no - 1 into v_no;

  insert into public.invoices (
    tenant_id, student_id, invoice_no, status, due_date, notes, created_by
  ) values (
    p_tenant_id, p_student_id, v_no, 'draft', p_due_date,
    nullif(trim(p_notes), ''), p_actor
  )
  returning id into v_invoice_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.created', 'invoice', v_invoice_id::text,
    jsonb_build_object('invoice_no', v_no, 'student_id', p_student_id)
  );

  return v_invoice_id;
end;
$$;

revoke all on function public.create_invoice(uuid, uuid, uuid, date, text) from public;
grant execute on function public.create_invoice(uuid, uuid, uuid, date, text) to service_role;

-- ------------------------------------------------------------------------
-- RPC: update_invoice_draft — edit header fields while still in draft.
-- ------------------------------------------------------------------------
create or replace function public.update_invoice_draft(
  p_invoice_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_due_date   date,
  p_notes      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_status <> 'draft' then
    raise exception 'invoice % is not draft (status=%)', p_invoice_id, v_status;
  end if;

  update public.invoices
     set due_date = p_due_date,
         notes    = nullif(trim(p_notes), '')
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.draft_updated', 'invoice', p_invoice_id::text,
    jsonb_build_object('due_date', p_due_date)
  );
end;
$$;

revoke all on function public.update_invoice_draft(uuid, uuid, uuid, date, text) from public;
grant execute on function public.update_invoice_draft(uuid, uuid, uuid, date, text) to service_role;

-- ------------------------------------------------------------------------
-- RPC: add_invoice_line — append a line to a draft invoice.
-- ------------------------------------------------------------------------
create or replace function public.add_invoice_line(
  p_invoice_id         uuid,
  p_tenant_id          uuid,
  p_actor              uuid,
  p_description        text,
  p_quantity           numeric,
  p_unit_price_cents   integer,
  p_tax_rate_bp        integer,
  p_related_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   public.invoice_status;
  v_line_id  uuid;
  v_amount   integer;
  v_tax_amt  integer;
  v_position integer;
begin
  select status into v_status from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_status <> 'draft' then
    raise exception 'invoice % is not draft (status=%)', p_invoice_id, v_status;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be > 0';
  end if;
  if p_unit_price_cents is null then
    raise exception 'unit_price_cents required';
  end if;

  v_amount  := round(p_quantity * p_unit_price_cents)::integer;
  v_tax_amt := round(v_amount * coalesce(p_tax_rate_bp, 0) / 10000.0)::integer;

  select coalesce(max(position), -1) + 1 into v_position
    from public.invoice_lines where invoice_id = p_invoice_id;

  insert into public.invoice_lines (
    invoice_id, tenant_id, description, quantity, unit_price_cents,
    tax_rate_bp, amount_cents, tax_amount_cents, related_package_id, position
  ) values (
    p_invoice_id, p_tenant_id, p_description, p_quantity, p_unit_price_cents,
    coalesce(p_tax_rate_bp, 2100), v_amount, v_tax_amt,
    p_related_package_id, v_position
  )
  returning id into v_line_id;

  perform public._recalc_invoice_totals(p_invoice_id);

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.line_added', 'invoice', p_invoice_id::text,
    jsonb_build_object(
      'line_id',     v_line_id,
      'description', p_description,
      'amount_cents', v_amount,
      'tax_amount_cents', v_tax_amt
    )
  );

  return v_line_id;
end;
$$;

revoke all on function public.add_invoice_line(uuid, uuid, uuid, text, numeric, integer, integer, uuid) from public;
grant execute on function public.add_invoice_line(uuid, uuid, uuid, text, numeric, integer, integer, uuid) to service_role;

-- ------------------------------------------------------------------------
-- RPC: remove_invoice_line — remove a line from a draft invoice.
-- ------------------------------------------------------------------------
create or replace function public.remove_invoice_line(
  p_line_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_status     public.invoice_status;
begin
  select invoice_id into v_invoice_id from public.invoice_lines
   where id = p_line_id and tenant_id = p_tenant_id;
  if v_invoice_id is null then
    raise exception 'line % not found in tenant %', p_line_id, p_tenant_id;
  end if;

  select status into v_status from public.invoices
   where id = v_invoice_id and tenant_id = p_tenant_id
   for update;
  if v_status <> 'draft' then
    raise exception 'invoice % is not draft (status=%)', v_invoice_id, v_status;
  end if;

  delete from public.invoice_lines
   where id = p_line_id and tenant_id = p_tenant_id;

  perform public._recalc_invoice_totals(v_invoice_id);

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.line_removed', 'invoice', v_invoice_id::text,
    jsonb_build_object('line_id', p_line_id)
  );
end;
$$;

revoke all on function public.remove_invoice_line(uuid, uuid, uuid) from public;
grant execute on function public.remove_invoice_line(uuid, uuid, uuid) to service_role;

-- ------------------------------------------------------------------------
-- RPC: set_invoice_status — enforce the legal transitions.
-- ------------------------------------------------------------------------
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
begin
  select status into v_current from public.invoices
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
         paid_at   = coalesce(v_paid,   paid_at)
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.status_changed', 'invoice', p_invoice_id::text,
    jsonb_build_object('from', v_current::text, 'to', p_status::text)
  );
end;
$$;

revoke all on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) to service_role;
