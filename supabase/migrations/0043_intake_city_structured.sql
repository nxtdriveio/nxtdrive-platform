-- 0043_intake_city_structured.sql
-- Task #57 — Address autocomplete on the intake form.
--
-- The "Wijk / ophaallocatie" (pickup) field already captures precise Google
-- Places data (0039). This migration extends the same treatment to the
-- "Woonplaats" (city) field so a picked city carries structured data
-- (place_id + optional lat/lng) instead of free text only.
--
-- Graceful degradation stays a first-class requirement: every new column is
-- nullable. When Google Places is unconfigured or the visitor just types, the
-- city stays plain text with null coordinates — exactly like today.
--
-- All writes continue to flow through the existing SECURITY DEFINER
-- create_lead_with_intake RPC as service_role; no new client write policies are
-- added. The existing select-only RLS already covers the new columns.

-- ---------------------------------------------------------------------------
-- 1. lead_intake_details — structured city columns
-- ---------------------------------------------------------------------------
alter table public.lead_intake_details
  add column if not exists city_lat      double precision,
  add column if not exists city_lng      double precision,
  add column if not exists city_place_id text;

alter table public.lead_intake_details
  drop constraint if exists lead_intake_details_city_coords_ck;
alter table public.lead_intake_details
  add constraint lead_intake_details_city_coords_ck check (
    -- lat/lng are both present or both absent, and within valid ranges.
    (city_lat is null) = (city_lng is null)
    and (city_lat is null or city_lat between -90 and 90)
    and (city_lng is null or city_lng between -180 and 180)
  );

alter table public.lead_intake_details
  drop constraint if exists lead_intake_details_city_place_id_ck;
alter table public.lead_intake_details
  add constraint lead_intake_details_city_place_id_ck
    check (char_length(coalesce(city_place_id, '')) <= 300);

-- ---------------------------------------------------------------------------
-- 2. create_lead_with_intake — accept structured city data
--    The runner tracks migrations by filename, so we drop the previous
--    signature (0039: 32 params) and recreate it with three appended params
--    (default null) to avoid an ambiguous overload. All existing
--    named-parameter callers keep working.
-- ---------------------------------------------------------------------------
drop function if exists public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text
);

create function public.create_lead_with_intake(
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
  p_user_agent                text,
  p_pickup_lat                double precision default null,
  p_pickup_lng                double precision default null,
  p_pickup_place_id           text default null,
  p_pickup_formatted_address  text default null,
  p_city_lat                  double precision default null,
  p_city_lng                  double precision default null,
  p_city_place_id             text default null
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
    pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address,
    city_lat, city_lng, city_place_id,
    license_goal, transmission, has_driving_experience, had_lessons_before,
    has_done_exam, theory_status, health_declaration_status,
    cbr_authorization_status, preferred_days, preferred_times,
    weekly_availability, desired_start_date, lessons_per_week, pace,
    has_anxiety, remarks, terms_accepted, terms_accepted_at
  ) values (
    v_lead_id, p_tenant_id, coalesce(p_applicant_type, 'student'),
    p_date_of_birth, p_city, p_pickup_location,
    p_pickup_lat, p_pickup_lng, p_pickup_place_id, p_pickup_formatted_address,
    p_city_lat, p_city_lng, p_city_place_id,
    p_license_goal, p_transmission,
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

revoke all on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text,
  double precision, double precision, text
) from public;
revoke execute on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text,
  double precision, double precision, text
) from anon, authenticated;
grant execute on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text,
  double precision, double precision, text
) to service_role;
