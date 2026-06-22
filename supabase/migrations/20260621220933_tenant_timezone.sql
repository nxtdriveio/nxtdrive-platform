alter table public.tenants
  add column if not exists timezone text not null default 'Europe/Amsterdam';

alter table public.tenants
  drop constraint if exists tenants_timezone_valid_check;

alter table public.tenants
  add constraint tenants_timezone_valid_check
  check (
    timezone = 'UTC'
    or timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$'
  );

comment on column public.tenants.timezone is
  'IANA timezone used for tenant calendar boundaries and wall-clock planning.';
