-- 0061_invoice_installments_credit_notes.sql
-- Module 6 (vervolg) — Termijnfacturen + Creditfacturen.
--
-- Two extensions to the invoicing model (0019):
--
--   1. Termijnfacturen (installments): a package total split across N separate
--      invoices, each with its own invoice_no, due_date and amount summing back
--      to the original total. Stored as an `installment_plans` parent row plus
--      N normal invoices tagged with (installment_plan_id, installment_no,
--      installment_count). Each line is labelled "Termijn X van N".
--
--   2. Creditfacturen (credit notes): a negative invoice that references an
--      original invoice, gets its own number and is recognisable via
--      kind = 'credit_note'. Its amounts are <= 0 so the existing
--      open-balance sums (which add total_cents of open invoices) net the
--      original out automatically.
--
-- All mutations stay service-role only via SECURITY DEFINER RPCs that reuse the
-- existing invoice RPCs (create_invoice / add_invoice_line / set_invoice_status)
-- as the function owner. No client write path is added; RLS exposes the new
-- columns/table for read only.

-- ===========================================================================
-- 1. invoices: new columns for credit notes + installments.
-- ===========================================================================
alter table public.invoices
  add column if not exists kind text not null default 'invoice',
  add column if not exists credit_of_invoice_id uuid,
  add column if not exists installment_plan_id uuid,
  add column if not exists installment_no integer,
  add column if not exists installment_count integer;

-- ===========================================================================
-- 2. installment_plans — parent row for a termijn-schema.
-- ===========================================================================
create table if not exists public.installment_plans (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  student_id         uuid not null,
  total_cents        integer not null,
  installment_count  integer not null,
  interval_days      integer not null default 30,
  first_due_date     date,
  description        text not null,
  related_package_id uuid,
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (total_cents > 0),
  check (installment_count between 2 and 60),
  check (interval_days between 0 and 365),
  check (char_length(description) between 1 and 500),
  check (notes is null or char_length(notes) <= 2000),
  constraint installment_plans_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete restrict,
  constraint installment_plans_package_tenant_fkey
    foreign key (related_package_id, tenant_id)
    references public.packages (id, tenant_id)
    on delete set null
);

alter table public.installment_plans
  drop constraint if exists installment_plans_id_tenant_unique;
alter table public.installment_plans
  add constraint installment_plans_id_tenant_unique unique (id, tenant_id);

create index if not exists idx_installment_plans_tenant
  on public.installment_plans (tenant_id);
create index if not exists idx_installment_plans_student
  on public.installment_plans (student_id, created_at desc);

-- ===========================================================================
-- 3. invoices: drop the three auto-named >= 0 sign CHECKs and replace with
--    kind-conditional ones (normal invoice >= 0, credit note <= 0), plus
--    coherence checks + the FKs that depend on installment_plans.
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select conname
      from pg_constraint
     where contype = 'c'
       and conrelid = 'public.invoices'::regclass
       and (
         pg_get_constraintdef(oid) ilike '%subtotal_cents >= 0%'
         or pg_get_constraintdef(oid) ilike '%tax_cents >= 0%'
         or pg_get_constraintdef(oid) ilike '%total_cents >= 0%'
       )
  loop
    execute format('alter table public.invoices drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.invoices
  add constraint invoices_kind_check
    check (kind in ('invoice', 'credit_note')),
  add constraint invoices_subtotal_sign_check
    check (
      (kind = 'invoice' and subtotal_cents >= 0)
      or (kind = 'credit_note' and subtotal_cents <= 0)
    ),
  add constraint invoices_tax_sign_check
    check (
      (kind = 'invoice' and tax_cents >= 0)
      or (kind = 'credit_note' and tax_cents <= 0)
    ),
  add constraint invoices_total_sign_check
    check (
      (kind = 'invoice' and total_cents >= 0)
      or (kind = 'credit_note' and total_cents <= 0)
    ),
  -- A credit note must reference an original; a normal invoice must not.
  add constraint invoices_credit_ref_check
    check ((kind = 'credit_note') = (credit_of_invoice_id is not null)),
  -- installment_no and installment_count are set together or not at all.
  add constraint invoices_installment_coherence_check
    check ((installment_no is null) = (installment_count is null)),
  add constraint invoices_installment_no_check
    check (installment_no is null or installment_no >= 1),
  add constraint invoices_installment_count_check
    check (installment_count is null or installment_count between 2 and 60),
  -- Self-FK: the credited original lives in the same tenant.
  add constraint invoices_credit_of_fkey
    foreign key (credit_of_invoice_id, tenant_id)
    references public.invoices (id, tenant_id)
    on delete restrict,
  add constraint invoices_installment_plan_fkey
    foreign key (installment_plan_id, tenant_id)
    references public.installment_plans (id, tenant_id)
    on delete set null;

create index if not exists idx_invoices_installment_plan
  on public.invoices (installment_plan_id);
create index if not exists idx_invoices_credit_of
  on public.invoices (credit_of_invoice_id);

-- ===========================================================================
-- 4. RLS on installment_plans — read-only, mirrors invoices visibility.
--    (No insert/update/delete policies — service role only.)
-- ===========================================================================
alter table public.installment_plans enable row level security;

drop policy if exists installment_plans_select_members on public.installment_plans;
create policy installment_plans_select_members on public.installment_plans
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = installment_plans.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = installment_plans.tenant_id
    )
    -- Parent / guardian branch: a linked child's plan.
    or student_id in (
      select g.student_id
        from public.student_guardians g
        join public.students s
          on s.id = g.student_id and s.tenant_id = installment_plans.tenant_id
       where g.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- 5. RPC: create_installment_plan — split a total across N open invoices.
-- ===========================================================================
-- Reuses create_invoice / add_invoice_line / set_invoice_status (owned by the
-- same role, so they run with definer rights here). The amount is split as
-- evenly as possible: base = floor(total / N), and the first `rem` installments
-- get one extra cent so the parts sum exactly to the total. Each invoice gets
-- its own due_date = first_due_date + (i-1) * interval_days.
create or replace function public.create_installment_plan(
  p_tenant_id          uuid,
  p_actor              uuid,
  p_student_id         uuid,
  p_total_cents        integer,
  p_installment_count  integer,
  p_first_due_date     date,
  p_interval_days      integer,
  p_description        text,
  p_tax_rate_bp        integer,
  p_related_package_id uuid,
  p_notes              text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id  uuid;
  v_count    integer := p_installment_count;
  v_interval integer := coalesce(p_interval_days, 30);
  v_desc     text    := nullif(trim(coalesce(p_description, '')), '');
  v_tax_bp   integer := coalesce(p_tax_rate_bp, 2100);
  v_base     integer;
  v_rem      integer;
  v_part     integer;
  v_due      date;
  v_invoice  uuid;
  i          integer;
begin
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;
  if v_desc is null then
    raise exception 'description required';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'total_cents must be > 0';
  end if;
  if v_count is null or v_count < 2 or v_count > 60 then
    raise exception 'installment_count must be between 2 and 60';
  end if;
  if v_interval < 0 or v_interval > 365 then
    raise exception 'interval_days must be between 0 and 365';
  end if;
  if v_tax_bp < 0 or v_tax_bp > 10000 then
    raise exception 'tax_rate_bp out of range';
  end if;

  insert into public.installment_plans (
    tenant_id, student_id, total_cents, installment_count, interval_days,
    first_due_date, description, related_package_id, notes, created_by
  ) values (
    p_tenant_id, p_student_id, p_total_cents, v_count, v_interval,
    p_first_due_date, v_desc, p_related_package_id,
    nullif(trim(coalesce(p_notes, '')), ''), p_actor
  )
  returning id into v_plan_id;

  -- p_total_cents is the NET total (excl. btw). add_invoice_line adds VAT on
  -- top of each line's net amount, mirroring create_invoice. Splitting the net
  -- guarantees the installment subtotals sum back to the total exactly: the
  -- first `rem` installments get one extra cent.
  v_base := p_total_cents / v_count;  -- integer division (floor for >= 0)
  v_rem  := p_total_cents - (v_base * v_count);

  for i in 1..v_count loop
    v_part := v_base + case when i <= v_rem then 1 else 0 end;
    if p_first_due_date is null then
      v_due := null;
    else
      v_due := p_first_due_date + ((i - 1) * v_interval);
    end if;

    v_invoice := public.create_invoice(
      p_tenant_id, p_actor, p_student_id, v_due,
      nullif(trim(coalesce(p_notes, '')), '')
    );

    update public.invoices
       set installment_plan_id = v_plan_id,
           installment_no      = i,
           installment_count   = v_count
     where id = v_invoice and tenant_id = p_tenant_id;

    perform public.add_invoice_line(
      v_invoice, p_tenant_id, p_actor,
      v_desc || ' — Termijn ' || i || ' van ' || v_count,
      1, v_part, v_tax_bp, p_related_package_id
    );

    perform public.set_invoice_status(v_invoice, p_tenant_id, p_actor, 'open');
  end loop;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'installment_plan.created', 'installment_plan',
    v_plan_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'total_cents', p_total_cents,
      'installment_count', v_count,
      'interval_days', v_interval
    )
  );

  return v_plan_id;
end;
$$;

revoke all on function public.create_installment_plan(uuid, uuid, uuid, integer, integer, date, integer, text, integer, uuid, text) from public;
revoke execute on function public.create_installment_plan(uuid, uuid, uuid, integer, integer, date, integer, text, integer, uuid, text) from anon, authenticated;
grant execute on function public.create_installment_plan(uuid, uuid, uuid, integer, integer, date, integer, text, integer, uuid, text) to service_role;

-- ===========================================================================
-- 6. RPC: create_credit_note — mirror an invoice with negative amounts.
-- ===========================================================================
-- Only an original invoice (kind = 'invoice') that is open or paid can be
-- credited, and only once. The credit note copies every line of the original
-- with a negated unit price, gets its own number, has no due_date (it is never
-- "overdue"), and is opened immediately.
create or replace function public.create_credit_note(
  p_tenant_id  uuid,
  p_actor      uuid,
  p_invoice_id uuid,
  p_reason     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind     text;
  v_status   public.invoice_status;
  v_student  uuid;
  v_no       integer;
  v_credit   uuid;
  v_reason   text := nullif(trim(coalesce(p_reason, '')), '');
  r          record;
begin
  select kind, status, student_id, invoice_no
    into v_kind, v_status, v_student, v_no
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if v_student is null then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_kind <> 'invoice' then
    raise exception 'cannot credit a credit note';
  end if;
  if v_status not in ('open', 'paid') then
    raise exception 'only open or paid invoices can be credited (status=%)', v_status;
  end if;
  if exists (
    select 1 from public.invoices
     where credit_of_invoice_id = p_invoice_id and tenant_id = p_tenant_id
  ) then
    raise exception 'invoice % already has a credit note', p_invoice_id;
  end if;

  v_credit := public.create_invoice(
    p_tenant_id, p_actor, v_student, null,
    coalesce(v_reason, 'Creditfactuur bij factuur #' || v_no)
  );

  update public.invoices
     set kind = 'credit_note',
         credit_of_invoice_id = p_invoice_id
   where id = v_credit and tenant_id = p_tenant_id;

  for r in
    select description, quantity, unit_price_cents, tax_rate_bp, related_package_id
      from public.invoice_lines
     where invoice_id = p_invoice_id and tenant_id = p_tenant_id
     order by position asc
  loop
    perform public.add_invoice_line(
      v_credit, p_tenant_id, p_actor,
      r.description, r.quantity, -r.unit_price_cents, r.tax_rate_bp,
      r.related_package_id
    );
  end loop;

  perform public.set_invoice_status(v_credit, p_tenant_id, p_actor, 'open');

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.credit_note_created', 'invoice',
    v_credit::text,
    jsonb_build_object(
      'credit_of_invoice_id', p_invoice_id,
      'original_invoice_no', v_no,
      'reason', v_reason
    )
  );

  return v_credit;
end;
$$;

revoke all on function public.create_credit_note(uuid, uuid, uuid, text) from public;
revoke execute on function public.create_credit_note(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.create_credit_note(uuid, uuid, uuid, text) to service_role;
