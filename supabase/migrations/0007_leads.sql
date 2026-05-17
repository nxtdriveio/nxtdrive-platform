-- 0007_leads.sql
-- Leads + lead_events: the public intake-to-conversion pipeline.

-- Enums --------------------------------------------------------------------
do $$ begin
  create type public.lead_status as enum (
    'new',
    'contacted',
    'package_advised',
    'converted',
    'dropped'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_source as enum (
    'website',
    'google',
    'instagram',
    'facebook',
    'whatsapp',
    'referral',
    'other'
  );
exception when duplicate_object then null; end $$;

-- leads --------------------------------------------------------------------
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  status        public.lead_status not null default 'new',
  source        public.lead_source not null default 'website',
  full_name     text not null,
  email         text,
  phone         text,
  postcode      text,
  message       text,
  assigned_to   uuid references auth.users(id) on delete set null,
  -- Light anti-abuse metadata (never exposed to clients)
  submitted_ip  inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (email is not null or phone is not null),
  check (char_length(full_name) between 1 and 200)
);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- lead_events: insert-only history of every touch on a lead -----------------
do $$ begin
  create type public.lead_event_type as enum (
    'created',
    'status_changed',
    'assigned',
    'note',
    'contacted'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.lead_events (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type    public.lead_event_type not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Block updates and deletes — lead_events is insert-only.
create or replace function public.lead_events_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'lead_events is insert-only';
end;
$$;

drop trigger if exists lead_events_no_update on public.lead_events;
create trigger lead_events_no_update
  before update on public.lead_events
  for each row execute function public.lead_events_block_mutation();

drop trigger if exists lead_events_no_delete on public.lead_events;
create trigger lead_events_no_delete
  before delete on public.lead_events
  for each row execute function public.lead_events_block_mutation();

-- Indexes ------------------------------------------------------------------
create index if not exists idx_leads_tenant_status_created
  on public.leads (tenant_id, status, created_at desc);

create index if not exists idx_leads_tenant_created
  on public.leads (tenant_id, created_at desc);

create index if not exists idx_leads_assigned
  on public.leads (assigned_to)
  where assigned_to is not null;

create index if not exists idx_lead_events_lead_created
  on public.lead_events (lead_id, created_at desc);

create index if not exists idx_lead_events_tenant_created
  on public.lead_events (tenant_id, created_at desc);
