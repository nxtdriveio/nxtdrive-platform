-- Every active instructor is qualified for RIS 2.0 by default. The dedicated
-- table keeps that policy explicit and reversible without overloading role
-- memberships. Existing instructors are backfilled; future instructor
-- memberships receive the qualification through a trigger.

create table if not exists public.instructor_training_qualifications (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  instructor_id    uuid not null references auth.users(id) on delete cascade,
  training_method  text not null,
  is_qualified     boolean not null default true,
  source           text not null default 'DEFAULT_INSTRUCTOR_POLICY',
  qualified_at     timestamptz,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  unique (tenant_id, instructor_id, training_method),
  check (training_method = 'RIS_2_0'),
  check (source in ('DEFAULT_INSTRUCTOR_POLICY', 'MANUAL', 'IMPORT')),
  check (
    (is_qualified and qualified_at is not null)
    or (not is_qualified)
  )
);

create index if not exists instructor_training_qualifications_lookup
  on public.instructor_training_qualifications (
    tenant_id,
    instructor_id,
    training_method,
    is_qualified
  );

drop trigger if exists instructor_training_qualifications_set_updated_at
  on public.instructor_training_qualifications;
create trigger instructor_training_qualifications_set_updated_at
  before update on public.instructor_training_qualifications
  for each row execute function public.set_updated_at();

create or replace function public._guard_instructor_training_qualification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.memberships m
     where m.tenant_id = new.tenant_id
       and m.user_id = new.instructor_id
       and m.role = 'instructor'
  ) then
    raise exception 'qualification requires an instructor membership';
  end if;

  if new.is_qualified and new.qualified_at is null then
    new.qualified_at := timezone('utc', now());
  elsif not new.is_qualified then
    new.qualified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists instructor_training_qualifications_guard
  on public.instructor_training_qualifications;
create trigger instructor_training_qualifications_guard
  before insert or update on public.instructor_training_qualifications
  for each row execute function public._guard_instructor_training_qualification();

create or replace function public._sync_default_instructor_ris20_qualification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'instructor' then
      delete from public.instructor_training_qualifications
       where tenant_id = old.tenant_id
         and instructor_id = old.user_id
         and training_method = 'RIS_2_0';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.role = 'instructor'
     and new.role <> 'instructor' then
    delete from public.instructor_training_qualifications
     where tenant_id = old.tenant_id
       and instructor_id = old.user_id
       and training_method = 'RIS_2_0';
  end if;

  if new.role = 'instructor' then
    insert into public.instructor_training_qualifications (
      tenant_id,
      instructor_id,
      training_method,
      is_qualified,
      source,
      qualified_at
    ) values (
      new.tenant_id,
      new.user_id,
      'RIS_2_0',
      true,
      'DEFAULT_INSTRUCTOR_POLICY',
      timezone('utc', now())
    )
    on conflict (tenant_id, instructor_id, training_method) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_sync_default_ris20_qualification
  on public.memberships;
create trigger memberships_sync_default_ris20_qualification
  after insert or update or delete on public.memberships
  for each row execute function public._sync_default_instructor_ris20_qualification();

insert into public.instructor_training_qualifications (
  tenant_id,
  instructor_id,
  training_method,
  is_qualified,
  source,
  qualified_at
)
select
  m.tenant_id,
  m.user_id,
  'RIS_2_0',
  true,
  'DEFAULT_INSTRUCTOR_POLICY',
  timezone('utc', now())
from public.memberships m
where m.role = 'instructor'
on conflict (tenant_id, instructor_id, training_method) do nothing;

alter table public.instructor_training_qualifications enable row level security;

drop policy if exists instructor_training_qualifications_select
  on public.instructor_training_qualifications;
create policy instructor_training_qualifications_select
  on public.instructor_training_qualifications
  for select
  using (
    instructor_id = auth.uid()
    or public.has_role(tenant_id, 'tenant_admin')
    or public.is_platform_admin()
  );

revoke all on table public.instructor_training_qualifications from public, anon;
revoke insert, update, delete on table public.instructor_training_qualifications
  from authenticated;
grant select on table public.instructor_training_qualifications to authenticated;
grant all on table public.instructor_training_qualifications to service_role;

revoke all on function public._guard_instructor_training_qualification()
  from public, anon, authenticated;
grant execute on function public._guard_instructor_training_qualification()
  to service_role;

revoke all on function public._sync_default_instructor_ris20_qualification()
  from public, anon, authenticated;
grant execute on function public._sync_default_instructor_ris20_qualification()
  to service_role;

comment on table public.instructor_training_qualifications is
  'Explicit instructor training-method qualifications. RIS 2.0 is provisioned as qualified by default for every instructor membership.';
