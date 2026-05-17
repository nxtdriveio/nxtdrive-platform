-- 0001_init.sql
-- Extensions, profiles (auto-created on signup), and the insert-only audit log.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  full_name          text,
  is_platform_admin  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data->>'full_name', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log: insert-only. No updates, no deletes — ever.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid references auth.users(id) on delete set null,
  tenant_id       uuid,
  action          text not null,
  target_type     text,
  target_id       text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- Block updates and deletes at the table level.
create or replace function public.audit_log_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is insert-only';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_block_mutation();

drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();
