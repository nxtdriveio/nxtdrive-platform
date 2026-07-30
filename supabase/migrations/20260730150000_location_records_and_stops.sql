-- Canonical, provider-neutral and versioned location foundation.
-- Additive by design: legacy address/location columns remain available during
-- cohort migration and parity verification.

create table if not exists public.location_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'ACTIVE',
  canonical_version_id uuid,
  merged_into_location_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint location_records_status_ck
    check (status in ('ACTIVE', 'ARCHIVED', 'MERGED')),
  constraint location_records_merge_shape_ck check (
    (status = 'MERGED' and merged_into_location_id is not null)
    or (status <> 'MERGED' and merged_into_location_id is null)
  ),
  constraint location_records_not_self_merged_ck
    check (merged_into_location_id is null or merged_into_location_id <> id),
  unique (id, tenant_id)
);

create table if not exists public.location_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_record_id uuid not null,
  version_number integer not null,
  label text not null,
  formatted_address text not null,
  street text,
  house_number text,
  house_number_addition text,
  postal_code text,
  city text,
  region text,
  country_code text not null default 'NL',
  latitude double precision,
  longitude double precision,
  source text not null,
  provider text,
  provider_place_id text,
  validation_status text not null default 'UNVALIDATED',
  provider_obtained_at timestamptz,
  provider_expires_at timestamptz,
  user_confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint location_versions_record_tenant_fkey
    foreign key (location_record_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete cascade,
  constraint location_versions_coords_ck check (
    (latitude is null) = (longitude is null)
    and (latitude is null or latitude between -90 and 90)
    and (longitude is null or longitude between -180 and 180)
  ),
  constraint location_versions_source_ck check (
    source in (
      'USER_ENTERED',
      'USER_CONFIRMED',
      'GOOGLE_PLACES',
      'GOOGLE_VALIDATION',
      'CSV_IMPORT',
      'ADMIN_CORRECTION',
      'LEGACY_MIGRATION'
    )
  ),
  constraint location_versions_provider_ck
    check (provider is null or provider = 'GOOGLE'),
  constraint location_versions_provider_shape_ck check (
    (provider is null and provider_place_id is null)
    or provider = 'GOOGLE'
  ),
  constraint location_versions_validation_ck check (
    validation_status in (
      'UNVALIDATED',
      'VALID',
      'PARTIAL',
      'REVIEW_REQUIRED',
      'MANUALLY_CONFIRMED',
      'INVALID',
      'PROVIDER_EXPIRED'
    )
  ),
  constraint location_versions_confirmed_ck check (
    validation_status <> 'MANUALLY_CONFIRMED'
    or (
      user_confirmed_at is not null
      and confirmed_by is not null
      and nullif(btrim(coalesce(change_reason, '')), '') is not null
    )
  ),
  constraint location_versions_country_ck
    check (country_code ~ '^[A-Z]{2}$'),
  constraint location_versions_text_ck check (
    char_length(label) between 1 and 160
    and char_length(formatted_address) between 1 and 500
    and char_length(coalesce(provider_place_id, '')) <= 300
  ),
  unique (location_record_id, version_number),
  unique (id, tenant_id)
);

alter table public.location_records
  drop constraint if exists location_records_canonical_version_fkey;
alter table public.location_records
  add constraint location_records_canonical_version_fkey
    foreign key (canonical_version_id, tenant_id)
    references public.location_versions (id, tenant_id)
    on delete restrict
    deferrable initially deferred;

alter table public.location_records
  drop constraint if exists location_records_merged_into_fkey;
alter table public.location_records
  add constraint location_records_merged_into_fkey
    foreign key (merged_into_location_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete restrict;

create index if not exists idx_location_records_tenant_status
  on public.location_records (tenant_id, status, updated_at desc);
create index if not exists idx_location_versions_record_created
  on public.location_versions (location_record_id, version_number desc);
create index if not exists idx_location_versions_postal_city
  on public.location_versions (tenant_id, postal_code, city)
  where postal_code is not null;
create index if not exists idx_location_versions_provider_place
  on public.location_versions (tenant_id, provider_place_id)
  where provider_place_id is not null;

create or replace function public._location_version_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    -- Privacy deletion removes the owning record; the cascade is the only
    -- allowed deletion path for immutable versions.
    return old;
  end if;
  raise exception 'location versions are immutable; create a new version';
end;
$$;

drop trigger if exists location_versions_immutable
  on public.location_versions;
create trigger location_versions_immutable
  before update or delete on public.location_versions
  for each row execute function public._location_version_immutable();

drop trigger if exists location_records_set_updated_at
  on public.location_records;
create trigger location_records_set_updated_at
  before update on public.location_records
  for each row execute function public.set_updated_at();

create table if not exists public.location_validation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_record_id uuid not null,
  location_version_id uuid not null,
  provider text,
  validation_status text not null,
  result_codes text[] not null default '{}',
  manually_confirmed boolean not null default false,
  manual_reason text,
  correlation_id text not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  constraint location_validation_record_fkey
    foreign key (location_record_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete cascade,
  constraint location_validation_version_fkey
    foreign key (location_version_id, tenant_id)
    references public.location_versions (id, tenant_id)
    on delete cascade,
  constraint location_validation_status_ck check (
    validation_status in (
      'UNVALIDATED',
      'VALID',
      'PARTIAL',
      'REVIEW_REQUIRED',
      'MANUALLY_CONFIRMED',
      'INVALID',
      'PROVIDER_EXPIRED'
    )
  ),
  constraint location_validation_manual_ck check (
    not manually_confirmed
    or nullif(btrim(coalesce(manual_reason, '')), '') is not null
  ),
  constraint location_validation_correlation_ck
    check (char_length(correlation_id) between 8 and 128)
);

create index if not exists idx_location_validation_tenant_status
  on public.location_validation_events
  (tenant_id, validation_status, occurred_at desc);

create table if not exists public.location_merge_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_location_id uuid not null,
  destination_location_id uuid not null,
  status text not null default 'PREVIEW',
  preview_document jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  rolled_back_at timestamptz,
  rolled_back_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint location_merge_source_fkey
    foreign key (source_location_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete restrict,
  constraint location_merge_destination_fkey
    foreign key (destination_location_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete restrict,
  constraint location_merge_distinct_ck
    check (source_location_id <> destination_location_id),
  constraint location_merge_status_ck
    check (status in ('PREVIEW', 'APPLIED', 'ROLLED_BACK', 'REJECTED')),
  constraint location_merge_preview_ck
    check (jsonb_typeof(preview_document) = 'object')
);

create table if not exists public.cbr_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  stable_code text not null,
  name text not null,
  location_type text not null default 'EXAM_CENTER',
  location_record_id uuid,
  address_snapshot text not null,
  latitude double precision,
  longitude double precision,
  provider_place_id text,
  official_source_reference text,
  valid_from date,
  valid_until date,
  last_verified_at timestamptz,
  status text not null default 'DRAFT',
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint cbr_locations_coords_ck check (
    (latitude is null) = (longitude is null)
    and (latitude is null or latitude between -90 and 90)
    and (longitude is null or longitude between -180 and 180)
  ),
  constraint cbr_locations_status_ck
    check (status in ('DRAFT', 'ACTIVE', 'REVIEW_REQUIRED', 'RETIRED')),
  constraint cbr_locations_type_ck
    check (location_type in ('EXAM_CENTER', 'THEORY_CENTER', 'TEST_CENTER')),
  constraint cbr_locations_validity_ck
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  unique (tenant_id, stable_code),
  unique (id, tenant_id)
);

drop trigger if exists cbr_locations_set_updated_at on public.cbr_locations;
create trigger cbr_locations_set_updated_at
  before update on public.cbr_locations
  for each row execute function public.set_updated_at();

alter table public.branches
  drop constraint if exists branches_id_tenant_unique;
alter table public.branches
  add constraint branches_id_tenant_unique unique (id, tenant_id);

create table if not exists public.entity_location_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_record_id uuid not null,
  role text not null,
  student_id uuid,
  instructor_user_id uuid references auth.users(id) on delete cascade,
  branch_id uuid,
  vehicle_id uuid,
  label text,
  is_default boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint entity_location_record_fkey
    foreign key (location_record_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete cascade,
  constraint entity_location_student_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  constraint entity_location_branch_fkey
    foreign key (branch_id, tenant_id)
    references public.branches (id, tenant_id)
    on delete cascade,
  constraint entity_location_vehicle_fkey
    foreign key (vehicle_id, tenant_id)
    references public.vehicles (id, tenant_id)
    on delete cascade,
  constraint entity_location_owner_ck check (
    num_nonnulls(student_id, instructor_user_id, branch_id, vehicle_id) = 1
  ),
  constraint entity_location_role_ck check (
    role in (
      'STUDENT_HOME',
      'STUDENT_PICKUP_DEFAULT',
      'STUDENT_DROPOFF_DEFAULT',
      'STUDENT_FAVORITE',
      'INSTRUCTOR_DAY_START',
      'INSTRUCTOR_DAY_END',
      'BRANCH_ADDRESS',
      'VEHICLE_BASE',
      'OPERATIONAL_LOCATION'
    )
  ),
  constraint entity_location_role_owner_ck check (
    (role like 'STUDENT_%' and student_id is not null)
    or (role like 'INSTRUCTOR_%' and instructor_user_id is not null)
    or (role = 'BRANCH_ADDRESS' and branch_id is not null)
    or (role = 'VEHICLE_BASE' and vehicle_id is not null)
    or role = 'OPERATIONAL_LOCATION'
  ),
  constraint entity_location_validity_ck
    check (valid_until is null or valid_until > valid_from)
);

create unique index if not exists uq_entity_location_active_single_roles
  on public.entity_location_links (
    tenant_id,
    coalesce(student_id, instructor_user_id, branch_id, vehicle_id),
    role
  )
  where valid_until is null
    and role <> 'STUDENT_FAVORITE'
    and role <> 'OPERATIONAL_LOCATION';
create unique index if not exists uq_entity_location_active_link
  on public.entity_location_links (tenant_id, location_record_id, role)
  where valid_until is null;
create index if not exists idx_entity_location_student
  on public.entity_location_links (tenant_id, student_id, role)
  where student_id is not null and valid_until is null;

create table if not exists public.appointment_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_type text not null,
  appointment_id uuid not null,
  lesson_id uuid,
  trial_lesson_id uuid,
  agenda_appointment_id uuid,
  module_test_id uuid,
  stop_type text not null,
  sequence_number integer not null default 0,
  source_location_record_id uuid,
  source_location_version_id uuid,
  label_snapshot text not null,
  formatted_address_snapshot text not null,
  latitude_snapshot double precision,
  longitude_snapshot double precision,
  publication_status text not null default 'DRAFT',
  published_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint appointment_stop_lesson_fkey
    foreign key (lesson_id) references public.lessons(id) on delete cascade,
  constraint appointment_stop_trial_fkey
    foreign key (trial_lesson_id) references public.trial_lessons(id) on delete cascade,
  constraint appointment_stop_agenda_fkey
    foreign key (agenda_appointment_id) references public.agenda_appointments(id) on delete cascade,
  constraint appointment_stop_module_test_fkey
    foreign key (module_test_id) references public.ris_module_tests(id) on delete cascade,
  constraint appointment_stop_source_record_fkey
    foreign key (source_location_record_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete set null,
  constraint appointment_stop_source_version_fkey
    foreign key (source_location_version_id, tenant_id)
    references public.location_versions (id, tenant_id)
    on delete set null,
  constraint appointment_stop_owner_ck check (
    num_nonnulls(lesson_id, trial_lesson_id, agenda_appointment_id, module_test_id) = 1
  ),
  constraint appointment_stop_owner_type_ck check (
    (appointment_type = 'LESSON' and appointment_id = lesson_id)
    or (appointment_type = 'TRIAL_LESSON' and appointment_id = trial_lesson_id)
    or (
      appointment_type in ('AGENDA_APPOINTMENT', 'EXAM')
      and appointment_id = agenda_appointment_id
    )
    or (appointment_type = 'MODULE_TEST' and appointment_id = module_test_id)
  ),
  constraint appointment_stop_type_ck check (
    appointment_type in (
      'LESSON',
      'TRIAL_LESSON',
      'AGENDA_APPOINTMENT',
      'EXAM',
      'MODULE_TEST'
    )
  ),
  constraint appointment_stop_stop_type_ck check (
    stop_type in ('PICKUP', 'DROPOFF', 'DESTINATION', 'START', 'END')
  ),
  constraint appointment_stop_coords_ck check (
    (latitude_snapshot is null) = (longitude_snapshot is null)
    and (latitude_snapshot is null or latitude_snapshot between -90 and 90)
    and (longitude_snapshot is null or longitude_snapshot between -180 and 180)
  ),
  constraint appointment_stop_publication_ck check (
    publication_status in ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'CANCELLED')
  ),
  constraint appointment_stop_publication_time_ck check (
    (publication_status = 'DRAFT' and published_at is null)
    or (publication_status <> 'DRAFT' and published_at is not null)
  )
);

create index if not exists idx_appointment_stops_tenant_appointment
  on public.appointment_stops
  (tenant_id, appointment_type, appointment_id, publication_status);
create index if not exists idx_appointment_stops_published
  on public.appointment_stops (tenant_id, published_at desc)
  where publication_status = 'PUBLISHED';
create unique index if not exists uq_appointment_stop_current_published
  on public.appointment_stops
  (tenant_id, appointment_type, appointment_id, stop_type, sequence_number)
  where publication_status = 'PUBLISHED';
create unique index if not exists uq_appointment_stop_current_draft
  on public.appointment_stops
  (tenant_id, appointment_type, appointment_id, stop_type, sequence_number)
  where publication_status = 'DRAFT';

create or replace function public._appointment_stop_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_old_payload jsonb;
  v_new_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.publication_status <> 'DRAFT' then
      raise exception 'published appointment stops are immutable';
    end if;
    return old;
  end if;

  if new.lesson_id is not null then
    select tenant_id into v_tenant_id from public.lessons where id = new.lesson_id;
  elsif new.trial_lesson_id is not null then
    select tenant_id into v_tenant_id from public.trial_lessons where id = new.trial_lesson_id;
  elsif new.agenda_appointment_id is not null then
    select tenant_id into v_tenant_id from public.agenda_appointments where id = new.agenda_appointment_id;
  else
    select tenant_id into v_tenant_id from public.ris_module_tests where id = new.module_test_id;
  end if;
  if v_tenant_id is null or v_tenant_id <> new.tenant_id then
    raise exception 'appointment stop tenant does not match appointment';
  end if;

  if tg_op = 'UPDATE' then
    v_old_payload := to_jsonb(old) - array[
      'publication_status', 'published_at', 'superseded_at'
    ];
    v_new_payload := to_jsonb(new) - array[
      'publication_status', 'published_at', 'superseded_at'
    ];
    if v_old_payload <> v_new_payload then
      raise exception 'appointment stop snapshots are immutable; create a new stop';
    end if;
    if old.publication_status <> 'DRAFT'
       and not (
         old.publication_status = 'PUBLISHED'
         and new.publication_status in ('SUPERSEDED', 'CANCELLED')
       ) then
      raise exception 'invalid appointment stop publication transition';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_stops_guard on public.appointment_stops;
create trigger appointment_stops_guard
  before insert or update or delete on public.appointment_stops
  for each row execute function public._appointment_stop_guard();

create table if not exists public.location_change_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_stop_id uuid not null references public.appointment_stops(id) on delete cascade,
  student_id uuid not null,
  proposed_location_record_id uuid,
  proposed_location_version_id uuid,
  status text not null default 'PROPOSED',
  explanation text,
  route_impact_status text,
  route_impact_document jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint location_change_student_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  constraint location_change_record_fkey
    foreign key (proposed_location_record_id, tenant_id)
    references public.location_records (id, tenant_id)
    on delete restrict,
  constraint location_change_version_fkey
    foreign key (proposed_location_version_id, tenant_id)
    references public.location_versions (id, tenant_id)
    on delete restrict,
  constraint location_change_status_ck check (
    status in ('PROPOSED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED')
  ),
  constraint location_change_route_status_ck check (
    route_impact_status is null
    or route_impact_status in (
      'FEASIBLE',
      'TIGHT',
      'INFEASIBLE',
      'UNKNOWN',
      'FALLBACK_ESTIMATE'
    )
  ),
  constraint location_change_document_ck
    check (jsonb_typeof(route_impact_document) = 'object')
);

create unique index if not exists uq_location_change_open
  on public.location_change_proposals (appointment_stop_id, student_id)
  where status in ('PROPOSED', 'UNDER_REVIEW');

create table if not exists public.appointment_travel_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_type text not null,
  appointment_id uuid not null,
  instructor_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint appointment_travel_status_ck
    check (status in ('NOT_STARTED', 'ON_MY_WAY', 'ARRIVED', 'DELAYED')),
  constraint appointment_travel_type_ck check (
    appointment_type in ('LESSON', 'TRIAL_LESSON', 'AGENDA_APPOINTMENT', 'EXAM')
  )
);

create index if not exists idx_travel_status_appointment
  on public.appointment_travel_status_events
  (tenant_id, appointment_type, appointment_id, occurred_at desc);

-- Enforce coordinate pairs on legacy temporary objects without breaking an
-- additive deploy when historical bad rows exist. New writes are constrained;
-- the migration preview reports rows that must be repaired before validation.
alter table public.booking_requests
  drop constraint if exists booking_requests_pickup_coords_pair_ck;
alter table public.booking_requests
  add constraint booking_requests_pickup_coords_pair_ck check (
    (pickup_lat is null) = (pickup_lng is null)
    and (pickup_lat is null or pickup_lat between -90 and 90)
    and (pickup_lng is null or pickup_lng between -180 and 180)
  ) not valid;

alter table public.booking_candidates
  drop constraint if exists booking_candidates_pickup_coords_pair_ck;
alter table public.booking_candidates
  add constraint booking_candidates_pickup_coords_pair_ck check (
    (pickup_lat is null) = (pickup_lng is null)
    and (pickup_lat is null or pickup_lat between -90 and 90)
    and (pickup_lng is null or pickup_lng between -180 and 180)
  ) not valid;

alter table public.lesson_refill_invitations
  drop constraint if exists lesson_refill_location_coords_pair_ck;
alter table public.lesson_refill_invitations
  add constraint lesson_refill_location_coords_pair_ck check (
    (location_lat is null) = (location_lng is null)
    and (location_lat is null or location_lat between -90 and 90)
    and (location_lng is null or location_lng between -180 and 180)
  ) not valid;

alter table public.location_records enable row level security;
alter table public.location_versions enable row level security;
alter table public.entity_location_links enable row level security;
alter table public.appointment_stops enable row level security;
alter table public.location_validation_events enable row level security;
alter table public.location_merge_operations enable row level security;
alter table public.location_change_proposals enable row level security;
alter table public.appointment_travel_status_events enable row level security;
alter table public.cbr_locations enable row level security;

create policy location_records_select_scope on public.location_records
  for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
    or exists (
      select 1
        from public.entity_location_links link
        join public.students student on student.id = link.student_id
       where link.location_record_id = location_records.id
         and link.tenant_id = location_records.tenant_id
         and student.user_id = auth.uid()
         and link.valid_until is null
    )
  );

create policy location_versions_select_scope on public.location_versions
  for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
    or exists (
      select 1
        from public.entity_location_links link
        join public.students student on student.id = link.student_id
       where link.location_record_id = location_versions.location_record_id
         and link.tenant_id = location_versions.tenant_id
         and student.user_id = auth.uid()
         and link.valid_until is null
    )
  );

create policy entity_location_links_select_scope on public.entity_location_links
  for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
    or student_id in (
      select student.id from public.students student
       where student.user_id = auth.uid()
    )
  );

create policy appointment_stops_select_scope on public.appointment_stops
  for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
    or (
      publication_status = 'PUBLISHED'
      and (
        lesson_id in (
          select lesson.id
            from public.lessons lesson
            join public.students student on student.id = lesson.student_id
           where student.user_id = auth.uid()
        )
        or agenda_appointment_id in (
          select appointment.id
            from public.agenda_appointments appointment
            join public.students student on student.id = appointment.student_id
           where student.user_id = auth.uid()
        )
      )
    )
  );

create policy location_validation_events_select_staff
  on public.location_validation_events for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy location_merge_operations_select_staff
  on public.location_merge_operations for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy location_change_proposals_select_scope
  on public.location_change_proposals for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
    or student_id in (
      select student.id from public.students student
       where student.user_id = auth.uid()
    )
  );
create policy appointment_travel_status_select_scope
  on public.appointment_travel_status_events for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
    or instructor_user_id = auth.uid()
  );
create policy cbr_locations_select_active on public.cbr_locations
  for select using (
    public.is_platform_admin()
    or status = 'ACTIVE'
    or tenant_id in (select public.my_tenant_ids())
  );

revoke insert, update, delete on public.location_records from anon, authenticated;
revoke insert, update, delete on public.location_versions from anon, authenticated;
revoke insert, update, delete on public.entity_location_links from anon, authenticated;
revoke insert, update, delete on public.appointment_stops from anon, authenticated;
revoke insert, update, delete on public.location_validation_events from anon, authenticated;
revoke insert, update, delete on public.location_merge_operations from anon, authenticated;
revoke insert, update, delete on public.location_change_proposals from anon, authenticated;
revoke insert, update, delete on public.appointment_travel_status_events from anon, authenticated;
revoke insert, update, delete on public.cbr_locations from anon, authenticated;

grant select on public.location_records to authenticated, service_role;
grant select on public.location_versions to authenticated, service_role;
grant select on public.entity_location_links to authenticated, service_role;
grant select on public.appointment_stops to authenticated, service_role;
grant select on public.location_validation_events to authenticated, service_role;
grant select on public.location_merge_operations to authenticated, service_role;
grant select on public.location_change_proposals to authenticated, service_role;
grant select on public.appointment_travel_status_events to authenticated, service_role;
grant select on public.cbr_locations to authenticated, service_role;
grant insert, update, delete on public.location_records to service_role;
grant insert, update, delete on public.location_versions to service_role;
grant insert, update, delete on public.entity_location_links to service_role;
grant insert, update, delete on public.appointment_stops to service_role;
grant insert, update, delete on public.location_validation_events to service_role;
grant insert, update, delete on public.location_merge_operations to service_role;
grant insert, update, delete on public.location_change_proposals to service_role;
grant insert on public.appointment_travel_status_events to service_role;
grant insert, update, delete on public.cbr_locations to service_role;

comment on table public.location_records is
  'Stable tenant-owned business identity for a location; provider ids never replace this id.';
comment on table public.location_versions is
  'Immutable copy-on-change location content with provenance and validation state.';
comment on table public.appointment_stops is
  'Immutable appointment location snapshots; published history never follows profile changes.';
