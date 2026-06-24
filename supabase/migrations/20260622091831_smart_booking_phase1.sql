-- Smart Booking Engine - phase 1 foundation.
--
-- Canonical lifecycle:
-- booking_request -> booking_candidates -> booking_hold -> confirmed entity.
-- This phase wires the public trial-lesson flow into the lifecycle while the
-- existing book_trial_lesson RPC remains the authoritative write for the actual
-- trial lesson row.

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  source text not null,
  requester_type text not null,
  entity_type text not null,
  status text not null default 'open',
  lead_id uuid references public.leads(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  requested_duration_min integer,
  required_transmission text,
  preferred_instructor_id uuid references auth.users(id) on delete set null,
  pickup_location text,
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_place_id text,
  pickup_formatted_address text,
  preferred_days jsonb not null default '[]'::jsonb,
  preferred_times jsonb not null default '[]'::jsonb,
  desired_start_date date,
  idempotency_key text,
  confirmed_entity_type text,
  confirmed_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in (
    'intake_wizard',
    'embedded_widget',
    'student_self_book',
    'student_reschedule',
    'slot_recovery',
    'instructor_next_lesson',
    'backoffice',
    'system'
  )),
  check (requester_type in (
    'public_lead',
    'student',
    'guardian',
    'staff',
    'system'
  )),
  check (entity_type in (
    'trial_lesson',
    'lesson',
    'agenda_appointment'
  )),
  check (status in (
    'draft',
    'open',
    'candidates_ready',
    'hold_pending',
    'confirmed',
    'cancelled',
    'expired',
    'failed'
  )),
  check (
    confirmed_entity_type is null or confirmed_entity_type in (
      'trial_lesson',
      'lesson',
      'agenda_appointment'
    )
  ),
  check (requested_duration_min is null or requested_duration_min between 15 and 720),
  check (pickup_lat is null or pickup_lat between -90 and 90),
  check (pickup_lng is null or pickup_lng between -180 and 180),
  check (jsonb_typeof(preferred_days) = 'array'),
  check (jsonb_typeof(preferred_times) = 'array'),
  check (jsonb_typeof(metadata) = 'object'),
  check (not (lead_id is not null and student_id is not null))
);

create unique index if not exists uq_booking_requests_idempotency
  on public.booking_requests (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_booking_requests_tenant_status
  on public.booking_requests (tenant_id, status, created_at desc);
create index if not exists idx_booking_requests_lead
  on public.booking_requests (lead_id, created_at desc)
  where lead_id is not null;
create index if not exists idx_booking_requests_student
  on public.booking_requests (student_id, created_at desc)
  where student_id is not null;
create index if not exists idx_booking_requests_branch
  on public.booking_requests (tenant_id, branch_id, status)
  where branch_id is not null;

drop trigger if exists booking_requests_set_updated_at on public.booking_requests;
create trigger booking_requests_set_updated_at
  before update on public.booking_requests
  for each row execute function public.set_updated_at();

drop trigger if exists trg_booking_requests_branch_tenant_check on public.booking_requests;
create trigger trg_booking_requests_branch_tenant_check
  before insert or update of tenant_id, branch_id on public.booking_requests
  for each row execute function public._check_branch_tenant_consistency();

create table if not exists public.booking_candidates (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  rank integer not null default 0,
  instructor_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_min integer not null,
  pickup_location text,
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_place_id text,
  pickup_formatted_address text,
  score integer not null default 0,
  score_factors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  blocking_reasons jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  route_status text,
  route_travel_to_min integer,
  route_travel_from_min integer,
  route_needs_confirm boolean not null default false,
  reason text,
  status text not null default 'generated',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (duration_min between 15 and 720),
  check (pickup_lat is null or pickup_lat between -90 and 90),
  check (pickup_lng is null or pickup_lng between -180 and 180),
  check (route_status is null or route_status in ('computed', 'estimated', 'unavailable')),
  check (status in (
    'generated',
    'selected',
    'held',
    'rejected',
    'expired',
    'confirmed'
  )),
  check (jsonb_typeof(score_factors) = 'array'),
  check (jsonb_typeof(warnings) = 'array'),
  check (jsonb_typeof(blocking_reasons) = 'array'),
  check (jsonb_typeof(validation) = 'object'),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists uq_booking_candidates_slot
  on public.booking_candidates (
    booking_request_id,
    instructor_id,
    starts_at,
    ends_at
  );

create index if not exists idx_booking_candidates_request_rank
  on public.booking_candidates (booking_request_id, rank, score desc);
create index if not exists idx_booking_candidates_tenant_starts
  on public.booking_candidates (tenant_id, starts_at);
create index if not exists idx_booking_candidates_instructor_starts
  on public.booking_candidates (tenant_id, instructor_id, starts_at);

drop trigger if exists booking_candidates_set_updated_at on public.booking_candidates;
create trigger booking_candidates_set_updated_at
  before update on public.booking_candidates
  for each row execute function public.set_updated_at();

drop trigger if exists trg_booking_candidates_branch_tenant_check on public.booking_candidates;
create trigger trg_booking_candidates_branch_tenant_check
  before insert or update of tenant_id, branch_id on public.booking_candidates
  for each row execute function public._check_branch_tenant_consistency();

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  booking_candidate_id uuid references public.booking_candidates(id) on delete set null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'active',
  held_by_user_id uuid references auth.users(id) on delete set null,
  hold_token_hash text,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  released_at timestamptz,
  confirmed_entity_type text,
  confirmed_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'confirmed', 'expired', 'released', 'cancelled')),
  check (
    confirmed_entity_type is null or confirmed_entity_type in (
      'trial_lesson',
      'lesson',
      'agenda_appointment'
    )
  )
);

create unique index if not exists uq_booking_holds_active_candidate
  on public.booking_holds (booking_candidate_id)
  where status = 'active' and booking_candidate_id is not null;

create index if not exists idx_booking_holds_request
  on public.booking_holds (booking_request_id, status, created_at desc);
create index if not exists idx_booking_holds_active_expiry
  on public.booking_holds (tenant_id, expires_at)
  where status = 'active';

drop trigger if exists booking_holds_set_updated_at on public.booking_holds;
create trigger booking_holds_set_updated_at
  before update on public.booking_holds
  for each row execute function public.set_updated_at();

drop trigger if exists trg_booking_holds_branch_tenant_check on public.booking_holds;
create trigger trg_booking_holds_branch_tenant_check
  before insert or update of tenant_id, branch_id on public.booking_holds
  for each row execute function public._check_branch_tenant_consistency();

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  booking_request_id uuid references public.booking_requests(id) on delete cascade,
  booking_candidate_id uuid references public.booking_candidates(id) on delete set null,
  booking_hold_id uuid references public.booking_holds(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  before_json jsonb,
  after_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object')
);

create index if not exists idx_booking_events_request
  on public.booking_events (booking_request_id, created_at desc);
create index if not exists idx_booking_events_tenant_created
  on public.booking_events (tenant_id, created_at desc);

drop trigger if exists trg_booking_events_branch_tenant_check on public.booking_events;
create trigger trg_booking_events_branch_tenant_check
  before insert or update of tenant_id, branch_id on public.booking_events
  for each row execute function public._check_branch_tenant_consistency();

create or replace function public.booking_events_block_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'booking_events is append-only';
end;
$$;

drop trigger if exists booking_events_no_update on public.booking_events;
create trigger booking_events_no_update
  before update or delete on public.booking_events
  for each row execute function public.booking_events_block_mutation();

alter table public.booking_requests enable row level security;
alter table public.booking_candidates enable row level security;
alter table public.booking_holds enable row level security;
alter table public.booking_events enable row level security;

drop policy if exists booking_requests_select_members on public.booking_requests;
create policy booking_requests_select_members on public.booking_requests
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.students s
       where s.id = booking_requests.student_id
         and s.tenant_id = booking_requests.tenant_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.student_guardians g
       where g.student_id = booking_requests.student_id
         and g.tenant_id = booking_requests.tenant_id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_candidates_select_members on public.booking_candidates;
create policy booking_candidates_select_members on public.booking_candidates
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.booking_requests br
        join public.students s
          on s.id = br.student_id
         and s.tenant_id = br.tenant_id
       where br.id = booking_candidates.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.student_guardians g
          on g.student_id = br.student_id
         and g.tenant_id = br.tenant_id
       where br.id = booking_candidates.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_holds_select_members on public.booking_holds;
create policy booking_holds_select_members on public.booking_holds
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.booking_requests br
        join public.students s
          on s.id = br.student_id
         and s.tenant_id = br.tenant_id
       where br.id = booking_holds.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.student_guardians g
          on g.student_id = br.student_id
         and g.tenant_id = br.tenant_id
       where br.id = booking_holds.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_events_select_members on public.booking_events;
create policy booking_events_select_members on public.booking_events
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.booking_requests br
        join public.students s
          on s.id = br.student_id
         and s.tenant_id = br.tenant_id
       where br.id = booking_events.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.student_guardians g
          on g.student_id = br.student_id
         and g.tenant_id = br.tenant_id
       where br.id = booking_events.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

grant select on public.booking_requests to authenticated, service_role;
grant select on public.booking_candidates to authenticated, service_role;
grant select on public.booking_holds to authenticated, service_role;
grant select on public.booking_events to authenticated, service_role;
grant all on public.booking_requests to service_role;
grant all on public.booking_candidates to service_role;
grant all on public.booking_holds to service_role;
grant all on public.booking_events to service_role;

create or replace function public._insert_booking_event(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_request_id uuid,
  p_candidate_id uuid,
  p_hold_id uuid,
  p_actor uuid,
  p_event_type text,
  p_before jsonb,
  p_after jsonb,
  p_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.booking_events (
    tenant_id,
    branch_id,
    booking_request_id,
    booking_candidate_id,
    booking_hold_id,
    actor_user_id,
    event_type,
    before_json,
    after_json,
    metadata
  ) values (
    p_tenant_id,
    p_branch_id,
    p_request_id,
    p_candidate_id,
    p_hold_id,
    p_actor,
    p_event_type,
    p_before,
    p_after,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public._booking_request_mutation_authorized(
  p_requester_type text,
  p_actor uuid,
  p_tenant_id uuid,
  p_lead_id uuid,
  p_student_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    (
      p_requester_type = 'public_lead'
      and p_actor is null
      and p_lead_id is not null
      and exists (
        select 1 from public.leads l
         where l.id = p_lead_id
           and l.tenant_id = p_tenant_id
      )
    )
    or (
      p_requester_type = 'system'
      and p_actor is null
    )
    or (
      p_actor is not null
      and public._tenant_staff_authorized(p_actor, p_tenant_id)
    )
    or (
      p_requester_type in ('student', 'guardian')
      and p_actor is not null
      and p_student_id is not null
      and (
        exists (
          select 1 from public.students s
           where s.id = p_student_id
             and s.tenant_id = p_tenant_id
             and s.user_id = p_actor
        )
        or exists (
          select 1 from public.student_guardians g
           where g.student_id = p_student_id
             and g.tenant_id = p_tenant_id
             and g.user_id = p_actor
        )
      )
    );
$$;

create or replace function public.create_booking_request(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_source text,
  p_requester_type text,
  p_entity_type text,
  p_lead_id uuid default null,
  p_student_id uuid default null,
  p_requested_duration_min integer default null,
  p_required_transmission text default null,
  p_preferred_instructor_id uuid default null,
  p_pickup_location text default null,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_pickup_place_id text default null,
  p_pickup_formatted_address text default null,
  p_preferred_days jsonb default '[]'::jsonb,
  p_preferred_times jsonb default '[]'::jsonb,
  p_desired_start_date date default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_branch_id uuid := p_branch_id;
  v_lead_branch uuid;
  v_student_branch uuid;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant % not found', p_tenant_id;
  end if;

  if p_lead_id is not null then
    select branch_id into v_lead_branch
      from public.leads
     where id = p_lead_id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
    end if;
    v_branch_id := coalesce(v_branch_id, v_lead_branch);
  end if;

  if p_student_id is not null then
    select branch_id into v_student_branch
      from public.students
     where id = p_student_id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
    end if;
    v_branch_id := coalesce(v_branch_id, v_student_branch);
  end if;

  if v_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = v_branch_id
       and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch % not found in tenant %', v_branch_id, p_tenant_id;
  end if;

  if p_preferred_instructor_id is not null and not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id
       and m.user_id = p_preferred_instructor_id
       and m.role in ('tenant_admin', 'instructor', 'branch_manager', 'planner')
  ) then
    raise exception 'preferred instructor % is not a tenant staff member', p_preferred_instructor_id;
  end if;

  if not public._booking_request_mutation_authorized(
    p_requester_type,
    p_actor,
    p_tenant_id,
    p_lead_id,
    p_student_id
  ) then
    raise exception 'actor is not authorized to create this booking request';
  end if;

  if p_idempotency_key is not null then
    select id into v_id
      from public.booking_requests
     where tenant_id = p_tenant_id
       and idempotency_key = p_idempotency_key
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.booking_requests (
    tenant_id,
    branch_id,
    source,
    requester_type,
    entity_type,
    status,
    lead_id,
    student_id,
    requested_duration_min,
    required_transmission,
    preferred_instructor_id,
    pickup_location,
    pickup_lat,
    pickup_lng,
    pickup_place_id,
    pickup_formatted_address,
    preferred_days,
    preferred_times,
    desired_start_date,
    idempotency_key,
    metadata,
    created_by
  ) values (
    p_tenant_id,
    v_branch_id,
    p_source,
    p_requester_type,
    p_entity_type,
    'open',
    p_lead_id,
    p_student_id,
    p_requested_duration_min,
    p_required_transmission,
    p_preferred_instructor_id,
    p_pickup_location,
    p_pickup_lat,
    p_pickup_lng,
    p_pickup_place_id,
    p_pickup_formatted_address,
    coalesce(p_preferred_days, '[]'::jsonb),
    coalesce(p_preferred_times, '[]'::jsonb),
    p_desired_start_date,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb),
    p_actor
  )
  returning id into v_id;

  perform public._insert_booking_event(
    p_tenant_id,
    v_branch_id,
    v_id,
    null,
    null,
    p_actor,
    'booking_request.created',
    null,
    jsonb_build_object(
      'id', v_id,
      'source', p_source,
      'requester_type', p_requester_type,
      'entity_type', p_entity_type,
      'status', 'open'
    ),
    '{}'::jsonb
  );

  return v_id;
end;
$$;

create or replace function public.replace_booking_candidates(
  p_booking_request_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_candidates jsonb
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.booking_requests%rowtype;
  v_item jsonb;
  v_count integer := 0;
  v_candidate_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration integer;
  v_instructor uuid;
  v_vehicle uuid;
begin
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'candidates must be a JSON array';
  end if;

  select * into v_request
    from public.booking_requests
   where id = p_booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_request.id is null then
    raise exception 'booking request % not found in tenant %', p_booking_request_id, p_tenant_id;
  end if;

  if not (
    (p_actor is null and v_request.requester_type = 'public_lead')
    or public._tenant_staff_authorized(p_actor, p_tenant_id)
  ) then
    raise exception 'actor is not authorized to replace booking candidates';
  end if;

  delete from public.booking_candidates
   where booking_request_id = p_booking_request_id
     and status in ('generated', 'selected', 'rejected', 'expired');

  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    v_instructor := nullif(v_item->>'instructor_id', '')::uuid;
    v_vehicle := nullif(v_item->>'vehicle_id', '')::uuid;
    v_starts_at := (v_item->>'starts_at')::timestamptz;
    v_ends_at := (v_item->>'ends_at')::timestamptz;
    v_duration := coalesce(
      nullif(v_item->>'duration_min', '')::integer,
      ceil(extract(epoch from (v_ends_at - v_starts_at)) / 60.0)::integer
    );

    if v_instructor is null then
      raise exception 'candidate instructor_id is required';
    end if;
    if not exists (
      select 1 from public.memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id = v_instructor
         and m.role in ('tenant_admin', 'instructor', 'branch_manager', 'planner')
    ) then
      raise exception 'candidate instructor % is not a tenant staff member', v_instructor;
    end if;

    insert into public.booking_candidates (
      booking_request_id,
      tenant_id,
      branch_id,
      rank,
      instructor_id,
      vehicle_id,
      starts_at,
      ends_at,
      duration_min,
      pickup_location,
      pickup_lat,
      pickup_lng,
      pickup_place_id,
      pickup_formatted_address,
      score,
      score_factors,
      warnings,
      blocking_reasons,
      validation,
      route_status,
      route_travel_to_min,
      route_travel_from_min,
      route_needs_confirm,
      reason,
      status,
      metadata
    ) values (
      p_booking_request_id,
      p_tenant_id,
      v_request.branch_id,
      coalesce(nullif(v_item->>'rank', '')::integer, v_count + 1),
      v_instructor,
      v_vehicle,
      v_starts_at,
      v_ends_at,
      v_duration,
      nullif(v_item->>'pickup_location', ''),
      nullif(v_item->>'pickup_lat', '')::double precision,
      nullif(v_item->>'pickup_lng', '')::double precision,
      nullif(v_item->>'pickup_place_id', ''),
      nullif(v_item->>'pickup_formatted_address', ''),
      coalesce(nullif(v_item->>'score', '')::integer, 0),
      coalesce(v_item->'score_factors', '[]'::jsonb),
      coalesce(v_item->'warnings', '[]'::jsonb),
      coalesce(v_item->'blocking_reasons', '[]'::jsonb),
      coalesce(v_item->'validation', '{}'::jsonb),
      nullif(v_item->>'route_status', ''),
      nullif(v_item->>'route_travel_to_min', '')::integer,
      nullif(v_item->>'route_travel_from_min', '')::integer,
      coalesce(nullif(v_item->>'route_needs_confirm', '')::boolean, false),
      nullif(v_item->>'reason', ''),
      coalesce(nullif(v_item->>'status', ''), 'generated'),
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (booking_request_id, instructor_id, starts_at, ends_at)
    do update set
      rank = excluded.rank,
      vehicle_id = excluded.vehicle_id,
      duration_min = excluded.duration_min,
      pickup_location = excluded.pickup_location,
      pickup_lat = excluded.pickup_lat,
      pickup_lng = excluded.pickup_lng,
      pickup_place_id = excluded.pickup_place_id,
      pickup_formatted_address = excluded.pickup_formatted_address,
      score = excluded.score,
      score_factors = excluded.score_factors,
      warnings = excluded.warnings,
      blocking_reasons = excluded.blocking_reasons,
      validation = excluded.validation,
      route_status = excluded.route_status,
      route_travel_to_min = excluded.route_travel_to_min,
      route_travel_from_min = excluded.route_travel_from_min,
      route_needs_confirm = excluded.route_needs_confirm,
      reason = excluded.reason,
      metadata = excluded.metadata,
      status = case
        when public.booking_candidates.status in ('held', 'confirmed') then public.booking_candidates.status
        else excluded.status
      end
    returning id into v_candidate_id;

    perform public._insert_booking_event(
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      v_candidate_id,
      null,
      p_actor,
      'booking_candidate.generated',
      null,
      v_item,
      '{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 and v_request.status not in ('confirmed', 'cancelled') then
    update public.booking_requests
       set status = 'candidates_ready'
     where id = p_booking_request_id
       and tenant_id = p_tenant_id;
  end if;

  perform public._insert_booking_event(
    p_tenant_id,
    v_request.branch_id,
    p_booking_request_id,
    null,
    null,
    p_actor,
    'booking_candidates.replaced',
    null,
    jsonb_build_object('count', v_count),
    '{}'::jsonb
  );

  return v_count;
end;
$$;

create or replace function public.expire_booking_holds(
  p_tenant_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.booking_holds%rowtype;
  v_count integer := 0;
begin
  for v_hold in
    select *
      from public.booking_holds
     where status = 'active'
       and expires_at <= now()
       and (p_tenant_id is null or tenant_id = p_tenant_id)
     for update skip locked
  loop
    update public.booking_holds
       set status = 'expired',
           released_at = now()
     where id = v_hold.id;

    update public.booking_candidates
       set status = 'expired'
     where id = v_hold.booking_candidate_id
       and status = 'held';

    update public.booking_requests r
       set status = 'expired'
     where r.id = v_hold.booking_request_id
       and r.status = 'hold_pending'
       and not exists (
         select 1 from public.booking_holds h
          where h.booking_request_id = r.id
            and h.status = 'active'
            and h.id <> v_hold.id
       );

    perform public._insert_booking_event(
      v_hold.tenant_id,
      v_hold.branch_id,
      v_hold.booking_request_id,
      v_hold.booking_candidate_id,
      v_hold.id,
      null,
      'booking_hold.expired',
      to_jsonb(v_hold),
      null,
      '{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.create_booking_hold(
  p_booking_request_id uuid,
  p_booking_candidate_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_expires_at timestamptz,
  p_hold_token_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.booking_requests%rowtype;
  v_candidate public.booking_candidates%rowtype;
  v_hold_id uuid;
begin
  perform public.expire_booking_holds(p_tenant_id);

  select * into v_request
    from public.booking_requests
   where id = p_booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_request.id is null then
    raise exception 'booking request % not found in tenant %', p_booking_request_id, p_tenant_id;
  end if;

  if not (
    (p_actor is null and v_request.requester_type = 'public_lead')
    or public._tenant_staff_authorized(p_actor, p_tenant_id)
  ) then
    raise exception 'actor is not authorized to create booking hold';
  end if;

  select * into v_candidate
    from public.booking_candidates
   where id = p_booking_candidate_id
     and booking_request_id = p_booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_candidate.id is null then
    raise exception 'booking candidate % not found for request %', p_booking_candidate_id, p_booking_request_id;
  end if;
  if v_candidate.starts_at <= now() then
    raise exception 'candidate starts in the past';
  end if;
  if p_expires_at <= now() then
    raise exception 'hold expiry must be in the future';
  end if;
  if exists (
    select 1 from public.booking_holds h
     where h.booking_candidate_id = p_booking_candidate_id
       and h.status = 'active'
  ) then
    raise exception 'candidate already has an active hold';
  end if;

  update public.booking_holds
     set status = 'released',
         released_at = now()
   where booking_request_id = p_booking_request_id
     and status = 'active';

  insert into public.booking_holds (
    booking_request_id,
    booking_candidate_id,
    tenant_id,
    branch_id,
    status,
    held_by_user_id,
    hold_token_hash,
    expires_at
  ) values (
    p_booking_request_id,
    p_booking_candidate_id,
    p_tenant_id,
    v_request.branch_id,
    'active',
    p_actor,
    p_hold_token_hash,
    p_expires_at
  )
  returning id into v_hold_id;

  update public.booking_candidates
     set status = 'held'
   where id = p_booking_candidate_id
     and tenant_id = p_tenant_id;

  update public.booking_requests
     set status = 'hold_pending'
   where id = p_booking_request_id
     and tenant_id = p_tenant_id
     and status not in ('confirmed', 'cancelled');

  perform public._insert_booking_event(
    p_tenant_id,
    v_request.branch_id,
    p_booking_request_id,
    p_booking_candidate_id,
    v_hold_id,
    p_actor,
    'booking_hold.created',
    null,
    jsonb_build_object('expires_at', p_expires_at),
    '{}'::jsonb
  );

  return v_hold_id;
end;
$$;

create or replace function public.release_booking_hold(
  p_booking_hold_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_hold public.booking_holds%rowtype;
  v_request public.booking_requests%rowtype;
begin
  select * into v_hold
    from public.booking_holds
   where id = p_booking_hold_id
     and tenant_id = p_tenant_id
   for update;
  if v_hold.id is null then
    raise exception 'booking hold % not found in tenant %', p_booking_hold_id, p_tenant_id;
  end if;
  select * into v_request
    from public.booking_requests
   where id = v_hold.booking_request_id
     and tenant_id = p_tenant_id;

  if not (
    (p_actor is null and v_request.requester_type = 'public_lead')
    or public._tenant_staff_authorized(p_actor, p_tenant_id)
  ) then
    raise exception 'actor is not authorized to release booking hold';
  end if;

  if v_hold.status <> 'active' then
    return;
  end if;

  update public.booking_holds
     set status = 'released',
         released_at = now()
   where id = p_booking_hold_id
     and tenant_id = p_tenant_id;

  update public.booking_candidates
     set status = 'generated'
   where id = v_hold.booking_candidate_id
     and tenant_id = p_tenant_id
     and status = 'held';

  update public.booking_requests
     set status = 'candidates_ready'
   where id = v_hold.booking_request_id
     and tenant_id = p_tenant_id
     and status = 'hold_pending';

  perform public._insert_booking_event(
    p_tenant_id,
    v_hold.branch_id,
    v_hold.booking_request_id,
    v_hold.booking_candidate_id,
    v_hold.id,
    p_actor,
    'booking_hold.released',
    to_jsonb(v_hold),
    null,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

create or replace function public.complete_booking_hold(
  p_booking_hold_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_confirmed_entity_type text,
  p_confirmed_entity_id uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_hold public.booking_holds%rowtype;
  v_request public.booking_requests%rowtype;
begin
  select * into v_hold
    from public.booking_holds
   where id = p_booking_hold_id
     and tenant_id = p_tenant_id
   for update;
  if v_hold.id is null then
    raise exception 'booking hold % not found in tenant %', p_booking_hold_id, p_tenant_id;
  end if;
  if v_hold.status <> 'active' then
    raise exception 'booking hold % is not active', p_booking_hold_id;
  end if;
  if v_hold.expires_at <= now() then
    perform public.expire_booking_holds(p_tenant_id);
    raise exception 'booking hold % is expired', p_booking_hold_id;
  end if;

  select * into v_request
    from public.booking_requests
   where id = v_hold.booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_request.id is null then
    raise exception 'booking request % not found', v_hold.booking_request_id;
  end if;

  if not (
    (p_actor is null and v_request.requester_type = 'public_lead')
    or public._tenant_staff_authorized(p_actor, p_tenant_id)
  ) then
    raise exception 'actor is not authorized to complete booking hold';
  end if;

  if p_confirmed_entity_type not in ('trial_lesson', 'lesson', 'agenda_appointment') then
    raise exception 'invalid confirmed entity type %', p_confirmed_entity_type;
  end if;

  update public.booking_holds
     set status = 'confirmed',
         confirmed_at = now(),
         confirmed_entity_type = p_confirmed_entity_type,
         confirmed_entity_id = p_confirmed_entity_id
   where id = p_booking_hold_id
     and tenant_id = p_tenant_id;

  update public.booking_candidates
     set status = 'confirmed'
   where id = v_hold.booking_candidate_id
     and tenant_id = p_tenant_id;

  update public.booking_requests
     set status = 'confirmed',
         confirmed_entity_type = p_confirmed_entity_type,
         confirmed_entity_id = p_confirmed_entity_id
   where id = v_hold.booking_request_id
     and tenant_id = p_tenant_id;

  update public.booking_holds
     set status = 'released',
         released_at = now()
   where booking_request_id = v_hold.booking_request_id
     and id <> p_booking_hold_id
     and status = 'active';

  perform public._insert_booking_event(
    p_tenant_id,
    v_hold.branch_id,
    v_hold.booking_request_id,
    v_hold.booking_candidate_id,
    v_hold.id,
    p_actor,
    'booking_hold.confirmed',
    to_jsonb(v_hold),
    jsonb_build_object(
      'confirmed_entity_type', p_confirmed_entity_type,
      'confirmed_entity_id', p_confirmed_entity_id
    ),
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.booking_events_block_mutation() from public;
revoke all on function public._insert_booking_event(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function public._booking_request_mutation_authorized(text, uuid, uuid, uuid, uuid) from public;
revoke all on function public.create_booking_request(uuid, uuid, text, text, text, uuid, uuid, integer, text, uuid, text, double precision, double precision, text, text, jsonb, jsonb, date, text, jsonb, uuid) from public;
revoke all on function public.replace_booking_candidates(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.expire_booking_holds(uuid) from public;
revoke all on function public.create_booking_hold(uuid, uuid, uuid, uuid, timestamptz, text) from public;
revoke all on function public.release_booking_hold(uuid, uuid, uuid, text) from public;
revoke all on function public.complete_booking_hold(uuid, uuid, uuid, text, uuid) from public;

revoke execute on function public.create_booking_request(uuid, uuid, text, text, text, uuid, uuid, integer, text, uuid, text, double precision, double precision, text, text, jsonb, jsonb, date, text, jsonb, uuid) from anon, authenticated;
revoke execute on function public.replace_booking_candidates(uuid, uuid, uuid, jsonb) from anon, authenticated;
revoke execute on function public.expire_booking_holds(uuid) from anon, authenticated;
revoke execute on function public.create_booking_hold(uuid, uuid, uuid, uuid, timestamptz, text) from anon, authenticated;
revoke execute on function public.release_booking_hold(uuid, uuid, uuid, text) from anon, authenticated;
revoke execute on function public.complete_booking_hold(uuid, uuid, uuid, text, uuid) from anon, authenticated;

grant execute on function public.create_booking_request(uuid, uuid, text, text, text, uuid, uuid, integer, text, uuid, text, double precision, double precision, text, text, jsonb, jsonb, date, text, jsonb, uuid) to service_role;
grant execute on function public.replace_booking_candidates(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.expire_booking_holds(uuid) to service_role;
grant execute on function public.create_booking_hold(uuid, uuid, uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.release_booking_hold(uuid, uuid, uuid, text) to service_role;
grant execute on function public.complete_booking_hold(uuid, uuid, uuid, text, uuid) to service_role;

comment on table public.booking_requests is
  'Canonical smart-booking lifecycle request: intake, self-booking, reschedule or slot recovery.';
comment on table public.booking_candidates is
  'Generated, validated and scored booking options for a booking request.';
comment on table public.booking_holds is
  'Temporary reservations for a selected booking candidate.';
comment on table public.booking_events is
  'Append-only audit trail for smart-booking lifecycle changes.';
