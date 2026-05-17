-- 0012_credit_ledger.sql
-- Insert-only credit ledger. The single source of truth for student balance.
-- Balance is ALWAYS sum(delta) — never cached, never mutated in place.
-- All writes go through SECURITY DEFINER RPCs paired with audit_log inserts.

do $$ begin
  create type public.credit_reason as enum (
    'package_purchase',
    'package_refund',
    'lesson_consumed',
    'lesson_refund',
    'adjustment',
    'opening_balance'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  student_id    uuid not null,
  delta         integer not null,
  reason        public.credit_reason not null,
  related_type  text,
  related_id    uuid,
  note          text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (delta <> 0),
  -- Tenant-consistency: row binds to a (student_id, tenant_id) pair.
  constraint credit_ledger_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade
);

create index if not exists idx_credit_ledger_student_created
  on public.credit_ledger (student_id, created_at desc);

create index if not exists idx_credit_ledger_tenant_created
  on public.credit_ledger (tenant_id, created_at desc);

-- Insert-only trigger (mirrors audit_log + lead_events).
create or replace function public.credit_ledger_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credit_ledger is insert-only';
end;
$$;

drop trigger if exists credit_ledger_no_update on public.credit_ledger;
create trigger credit_ledger_no_update
  before update on public.credit_ledger
  for each row execute function public.credit_ledger_block_mutation();

drop trigger if exists credit_ledger_no_delete on public.credit_ledger;
create trigger credit_ledger_no_delete
  before delete on public.credit_ledger
  for each row execute function public.credit_ledger_block_mutation();

-- Balance view: sum of deltas per student.
create or replace view public.student_credit_balance as
select
  s.id            as student_id,
  s.tenant_id     as tenant_id,
  coalesce(sum(l.delta), 0)::integer as balance
from public.students s
left join public.credit_ledger l
  on l.student_id = s.id and l.tenant_id = s.tenant_id
group by s.id, s.tenant_id;

-- RLS ----------------------------------------------------------------------
alter table public.credit_ledger enable row level security;

drop policy if exists credit_ledger_select_members on public.credit_ledger;
create policy credit_ledger_select_members on public.credit_ledger
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- No INSERT/UPDATE/DELETE policies — service role only.

-- RPCs ---------------------------------------------------------------------

-- grant_package: add a package's worth of credits to a student, atomically.
create or replace function public.grant_package(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack   record;
  v_ledger uuid;
begin
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  select id, name, credits_total, price_cents, active
    into v_pack
    from public.packages
   where id = p_package_id and tenant_id = p_tenant_id;
  if v_pack.id is null then
    raise exception 'package % not found in tenant %', p_package_id, p_tenant_id;
  end if;
  if not v_pack.active then
    raise exception 'package % is not active', p_package_id;
  end if;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
  ) values (
    p_tenant_id, p_student_id, v_pack.credits_total, 'package_purchase',
    'package', v_pack.id,
    'Pakket toegekend: ' || v_pack.name, p_actor
  )
  returning id into v_ledger;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'credits.granted', 'student', p_student_id::text,
    jsonb_build_object(
      'package_id',   v_pack.id,
      'package_name', v_pack.name,
      'credits',      v_pack.credits_total,
      'price_cents',  v_pack.price_cents,
      'ledger_id',    v_ledger
    )
  );

  return v_ledger;
end;
$$;

revoke all on function public.grant_package(uuid, uuid, uuid, uuid) from public;
grant execute on function public.grant_package(uuid, uuid, uuid, uuid) to service_role;

-- adjust_credits: free-form admin correction.
create or replace function public.adjust_credits(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_delta      integer,
  p_note       text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger uuid;
begin
  if p_delta = 0 then
    raise exception 'delta must be non-zero';
  end if;
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, note, actor_user_id
  ) values (
    p_tenant_id, p_student_id, p_delta, 'adjustment', p_note, p_actor
  )
  returning id into v_ledger;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'credits.adjusted', 'student', p_student_id::text,
    jsonb_build_object('delta', p_delta, 'note', p_note, 'ledger_id', v_ledger)
  );

  return v_ledger;
end;
$$;

revoke all on function public.adjust_credits(uuid, uuid, uuid, integer, text) from public;
grant execute on function public.adjust_credits(uuid, uuid, uuid, integer, text) to service_role;

-- convert_lead_to_student: lead → student in one transaction, optionally
-- grant a package straight away. Also flips the lead to 'converted'.
create or replace function public.convert_lead_to_student(
  p_lead_id    uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead       record;
  v_student_id uuid;
begin
  select id, status, full_name, email, phone, postcode
    into v_lead
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if v_lead.id is null then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  insert into public.students (tenant_id, lead_id, full_name, email, phone, postcode)
  values (p_tenant_id, v_lead.id, v_lead.full_name, v_lead.email, v_lead.phone, v_lead.postcode)
  returning id into v_student_id;

  if v_lead.status <> 'converted' then
    update public.leads
       set status = 'converted'
     where id = p_lead_id and tenant_id = p_tenant_id;

    insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
    values (
      p_lead_id, p_tenant_id, p_actor, 'status_changed',
      jsonb_build_object('from', v_lead.status::text, 'to', 'converted', 'student_id', v_student_id)
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lead.converted', 'lead', p_lead_id::text,
    jsonb_build_object('student_id', v_student_id, 'package_id', p_package_id)
  );

  if p_package_id is not null then
    perform public.grant_package(v_student_id, p_tenant_id, p_actor, p_package_id);
  end if;

  return v_student_id;
end;
$$;

revoke all on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) from public;
grant execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) to service_role;
