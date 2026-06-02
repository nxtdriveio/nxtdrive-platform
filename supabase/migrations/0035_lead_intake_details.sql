-- 0035_lead_intake_details.sql
-- Fase 1 — Slimme Intake Wizard.
-- Structured, typed answers from the multi-step public intake wizard, stored
-- 1:1 with a lead. Typed columns for everything that will later be filtered or
-- scored (transmission, trajectory type, availability, theory/CBR/health
-- declaration status, desired start date); free text kept separate.
--
-- Writes ALWAYS go through the service role via create_lead_with_intake().
-- No client INSERT/UPDATE/DELETE policies — read-only for tenant members.

-- Enums --------------------------------------------------------------------
do $$ begin
  create type public.intake_applicant_type as enum ('student', 'guardian');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.intake_transmission as enum ('manual', 'automatic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.intake_license_goal as enum ('B', 'BE', 'AM', 'A', 'T', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.intake_pace as enum ('relaxed', 'fast');
exception when duplicate_object then null; end $$;

-- Tri-state for "done / not yet / unknown" style questions (theory passed,
-- health declaration arranged, CBR authorization done).
do $$ begin
  create type public.intake_status as enum ('yes', 'no', 'unknown');
exception when duplicate_object then null; end $$;

-- lead_intake_details ------------------------------------------------------
create table if not exists public.lead_intake_details (
  id                          uuid primary key default gen_random_uuid(),
  lead_id                     uuid not null,
  tenant_id                   uuid not null,
  -- Step 1 — person
  applicant_type              public.intake_applicant_type not null default 'student',
  date_of_birth               date,
  city                        text,
  pickup_location             text,
  -- Step 2 — driving education
  license_goal                public.intake_license_goal,
  transmission                public.intake_transmission,
  has_driving_experience      boolean,
  had_lessons_before          boolean,
  has_done_exam               boolean,
  theory_status               public.intake_status not null default 'unknown',
  health_declaration_status   public.intake_status not null default 'unknown',
  cbr_authorization_status    public.intake_status not null default 'unknown',
  -- Step 3 — availability
  preferred_days              text[] not null default '{}',
  preferred_times             text[] not null default '{}',
  weekly_availability         text,
  desired_start_date          date,
  lessons_per_week            smallint,
  -- Step 4 — learner profile
  pace                        public.intake_pace,
  has_anxiety                 boolean,
  remarks                     text,
  -- Step 5 — agreements
  terms_accepted              boolean not null default false,
  terms_accepted_at           timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- One intake detail per lead.
  constraint lead_intake_details_lead_unique unique (lead_id),
  -- Tenant consistency: the (lead_id, tenant_id) pair must match a real lead.
  constraint lead_intake_details_lead_tenant_fkey
    foreign key (lead_id, tenant_id)
    references public.leads (id, tenant_id)
    on delete cascade,
  check (lessons_per_week is null or lessons_per_week between 1 and 14),
  check (char_length(coalesce(city, '')) <= 200),
  check (char_length(coalesce(pickup_location, '')) <= 200),
  check (char_length(coalesce(weekly_availability, '')) <= 500),
  check (char_length(coalesce(remarks, '')) <= 2000),
  check (cardinality(preferred_days) <= 7),
  check (cardinality(preferred_times) <= 4)
);

drop trigger if exists lead_intake_details_set_updated_at on public.lead_intake_details;
create trigger lead_intake_details_set_updated_at
  before update on public.lead_intake_details
  for each row execute function public.set_updated_at();

-- Indexes ------------------------------------------------------------------
-- lead_id is already unique; add a tenant index for tenant-scoped scans
-- (Fase 1B analysis will aggregate across a tenant's intakes).
create index if not exists idx_lead_intake_details_tenant_created
  on public.lead_intake_details (tenant_id, created_at desc);

-- RLS ----------------------------------------------------------------------
alter table public.lead_intake_details enable row level security;

drop policy if exists lead_intake_details_select_members on public.lead_intake_details;
create policy lead_intake_details_select_members on public.lead_intake_details
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- No INSERT/UPDATE/DELETE policies — service role writes only.

-- create_lead_with_intake --------------------------------------------------
-- Transactional: inserts lead + lead_intake_details + lead_event + audit_log
-- in one SECURITY DEFINER call. Used by the public intake wizard server action.
create or replace function public.create_lead_with_intake(
  p_tenant_id                 uuid,
  p_source                    public.lead_source,
  p_full_name                 text,
  p_email                     text,
  p_phone                     text,
  p_applicant_type            public.intake_applicant_type,
  p_date_of_birth             date,
  p_city                      text,
  p_pickup_location           text,
  p_license_goal              public.intake_license_goal,
  p_transmission              public.intake_transmission,
  p_has_driving_experience    boolean,
  p_had_lessons_before        boolean,
  p_has_done_exam             boolean,
  p_theory_status             public.intake_status,
  p_health_declaration_status public.intake_status,
  p_cbr_authorization_status  public.intake_status,
  p_preferred_days            text[],
  p_preferred_times           text[],
  p_weekly_availability       text,
  p_desired_start_date        date,
  p_lessons_per_week          int,
  p_pace                      public.intake_pace,
  p_has_anxiety               boolean,
  p_remarks                   text,
  p_terms_accepted            boolean,
  p_submitted_ip              inet,
  p_user_agent                text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if p_terms_accepted is not true then
    raise exception 'terms must be accepted';
  end if;

  insert into public.leads (
    tenant_id, status, source, full_name, email, phone,
    submitted_ip, user_agent
  ) values (
    p_tenant_id, 'new', coalesce(p_source, 'website'), p_full_name, p_email,
    p_phone, p_submitted_ip, p_user_agent
  )
  returning id into v_lead_id;

  insert into public.lead_intake_details (
    lead_id, tenant_id, applicant_type, date_of_birth, city, pickup_location,
    license_goal, transmission, has_driving_experience, had_lessons_before,
    has_done_exam, theory_status, health_declaration_status,
    cbr_authorization_status, preferred_days, preferred_times,
    weekly_availability, desired_start_date, lessons_per_week, pace,
    has_anxiety, remarks, terms_accepted, terms_accepted_at
  ) values (
    v_lead_id, p_tenant_id, coalesce(p_applicant_type, 'student'),
    p_date_of_birth, p_city, p_pickup_location, p_license_goal, p_transmission,
    p_has_driving_experience, p_had_lessons_before, p_has_done_exam,
    coalesce(p_theory_status, 'unknown'),
    coalesce(p_health_declaration_status, 'unknown'),
    coalesce(p_cbr_authorization_status, 'unknown'),
    coalesce(p_preferred_days, '{}'), coalesce(p_preferred_times, '{}'),
    p_weekly_availability, p_desired_start_date,
    nullif(p_lessons_per_week, 0)::smallint, p_pace, p_has_anxiety, p_remarks,
    true, now()
  );

  insert into public.lead_events (lead_id, tenant_id, event_type, payload)
  values (
    v_lead_id, p_tenant_id, 'created',
    jsonb_build_object('source', coalesce(p_source, 'website')::text, 'via', 'intake_wizard')
  );

  insert into public.audit_log (tenant_id, action, target_type, target_id, payload)
  values (
    p_tenant_id, 'lead.created', 'lead', v_lead_id::text,
    jsonb_build_object('source', coalesce(p_source, 'website')::text, 'via', 'intake_wizard')
  );

  return v_lead_id;
end;
$$;

-- Service-role-only: revoke from PUBLIC, anon and authenticated so the RPC
-- cannot be invoked (or its actor forged) via the PostgREST anon/auth roles.
revoke all on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text
) from public;
revoke execute on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text
) from anon, authenticated;
grant execute on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text
) to service_role;
