-- Smart Appointment Wizard foundation.
-- Additive and snapshot-based: existing appointment semantics remain intact.

create table if not exists public.appointment_type_policies (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  version integer not null default 1,
  label text not null,
  short_label text not null,
  category text not null,
  student_requirement text not null,
  default_duration_minutes integer not null,
  min_duration_minutes integer not null,
  max_duration_minutes integer not null,
  duration_step_minutes integer not null,
  default_buffer_before_minutes integer not null default 0,
  default_buffer_after_minutes integer not null default 0,
  min_buffer_before_minutes integer not null default 0,
  min_buffer_after_minutes integer not null default 0,
  location_requirement text not null default 'NONE',
  vehicle_requirement text not null default 'NONE',
  route_validation_enabled boolean not null default false,
  blocks_instructor_availability boolean not null default true,
  blocks_vehicle_availability boolean not null default false,
  instructor_can_override_duration boolean not null default true,
  instructor_can_override_buffer boolean not null default true,
  instructor_can_override_location boolean not null default true,
  instructor_can_override_vehicle boolean not null default false,
  notify_student_on_create boolean not null default false,
  notify_student_on_change boolean not null default false,
  student_visibility text not null default 'HIDDEN',
  calendar_tone text not null,
  icon_key text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, code),
  constraint appointment_type_policies_code_ck check (
    code in (
      'lesson', 'exam', 'interim_test', 'theory_guidance', 'free_block',
      'break', 'private_block', 'maintenance', 'admin', 'vacation'
    )
  ),
  constraint appointment_type_policies_category_ck check (
    category in ('STUDENT', 'PRIVATE', 'OPERATIONAL')
  ),
  constraint appointment_type_policies_student_ck check (
    student_requirement in ('REQUIRED', 'OPTIONAL', 'FORBIDDEN')
  ),
  constraint appointment_type_policies_location_ck check (
    location_requirement in (
      'NONE', 'OPTIONAL', 'PICKUP', 'DESTINATION', 'PICKUP_AND_DESTINATION'
    )
  ),
  constraint appointment_type_policies_vehicle_ck check (
    vehicle_requirement in ('NONE', 'AUTO', 'REQUIRED')
  ),
  constraint appointment_type_policies_visibility_ck check (
    student_visibility in ('HIDDEN', 'AFTER_CONFIRMATION', 'PUBLISHED')
  ),
  constraint appointment_type_policies_tone_ck check (
    calendar_tone in ('BLUE', 'VIOLET', 'ROSE', 'AMBER', 'GREEN', 'TEAL', 'NEUTRAL', 'SAND')
  ),
  constraint appointment_type_policies_duration_ck check (
    min_duration_minutes >= 5
    and max_duration_minutes <= 480
    and min_duration_minutes <= default_duration_minutes
    and default_duration_minutes <= max_duration_minutes
    and duration_step_minutes between 5 and 120
  ),
  constraint appointment_type_policies_buffer_ck check (
    default_buffer_before_minutes between 0 and 240
    and default_buffer_after_minutes between 0 and 240
    and min_buffer_before_minutes between 0 and default_buffer_before_minutes
    and min_buffer_after_minutes between 0 and default_buffer_after_minutes
  )
);

create index if not exists idx_appointment_type_policies_tenant_active
  on public.appointment_type_policies (tenant_id, is_active, sort_order);

drop trigger if exists appointment_type_policies_set_updated_at
  on public.appointment_type_policies;
create trigger appointment_type_policies_set_updated_at
  before update on public.appointment_type_policies
  for each row execute function public.set_updated_at();

create or replace function public._increment_appointment_policy_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_type_policies_increment_version
  on public.appointment_type_policies;
create trigger appointment_type_policies_increment_version
  before update on public.appointment_type_policies
  for each row execute function public._increment_appointment_policy_version();

create table if not exists public.appointment_wizard_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  student_scope text not null default 'OWN_ACTIVE',
  allow_student_home_as_pickup boolean not null default true,
  allow_default_pickup_update boolean not null default false,
  vehicle_required boolean not null default true,
  vehicle_selection_mode text not null default 'AUTO_WITH_OVERRIDE',
  instructor_may_override_vehicle boolean not null default true,
  validate_vehicle_availability boolean not null default true,
  route_override_requires_reason boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint appointment_wizard_settings_scope_ck check (
    student_scope in ('OWN_ACTIVE', 'OWN_AND_REPLACEMENT', 'BRANCH_ACTIVE', 'TENANT_ACTIVE')
  ),
  constraint appointment_wizard_settings_vehicle_mode_ck check (
    vehicle_selection_mode in ('AUTO_DEFAULT', 'AUTO_WITH_OVERRIDE', 'ALWAYS_SELECT')
  )
);

drop trigger if exists appointment_wizard_settings_set_updated_at
  on public.appointment_wizard_settings;
create trigger appointment_wizard_settings_set_updated_at
  before update on public.appointment_wizard_settings
  for each row execute function public.set_updated_at();

create table if not exists public.instructor_appointment_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instructor_id uuid not null references auth.users(id) on delete cascade,
  appointment_type_code text not null,
  duration_minutes integer,
  buffer_before_minutes integer,
  buffer_after_minutes integer,
  preferred_vehicle_id uuid references public.vehicles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, instructor_id, appointment_type_code),
  constraint instructor_appointment_preferences_code_ck check (
    appointment_type_code in (
      'lesson', 'exam', 'interim_test', 'theory_guidance', 'free_block',
      'break', 'private_block', 'maintenance', 'admin', 'vacation'
    )
  ),
  constraint instructor_appointment_preferences_duration_ck check (
    duration_minutes is null or duration_minutes between 5 and 480
  ),
  constraint instructor_appointment_preferences_buffer_before_ck check (
    buffer_before_minutes is null or buffer_before_minutes between 0 and 240
  ),
  constraint instructor_appointment_preferences_buffer_after_ck check (
    buffer_after_minutes is null or buffer_after_minutes between 0 and 240
  )
);

create table if not exists public.appointment_wizard_analytics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  appointment_type_code text,
  step_code text,
  duration_ms integer,
  taps integer,
  flags jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint appointment_wizard_analytics_event_ck check (
    event_name in (
      'appointment_wizard_opened', 'appointment_type_selected',
      'student_search_started', 'student_selected', 'pickup_changed',
      'duration_changed', 'buffer_changed', 'vehicle_auto_resolved',
      'vehicle_selection_required', 'planning_warning_shown',
      'appointment_wizard_completed', 'appointment_wizard_cancelled'
    )
  ),
  constraint appointment_wizard_analytics_duration_ck check (
    duration_ms is null or duration_ms between 0 and 86400000
  ),
  constraint appointment_wizard_analytics_taps_ck check (
    taps is null or taps between 0 and 1000
  ),
  constraint appointment_wizard_analytics_flags_ck check (
    jsonb_typeof(flags) = 'object'
  )
);
create index if not exists idx_appointment_wizard_analytics_tenant_time
  on public.appointment_wizard_analytics (tenant_id, occurred_at desc);

drop trigger if exists instructor_appointment_preferences_set_updated_at
  on public.instructor_appointment_preferences;
create trigger instructor_appointment_preferences_set_updated_at
  before update on public.instructor_appointment_preferences
  for each row execute function public.set_updated_at();

alter table public.students
  add column if not exists preferred_lesson_duration_minutes integer;
alter table public.students
  drop constraint if exists students_preferred_lesson_duration_minutes_ck;
alter table public.students
  add constraint students_preferred_lesson_duration_minutes_ck check (
    preferred_lesson_duration_minutes is null
    or preferred_lesson_duration_minutes between 15 and 240
  );

alter table public.vehicles
  add column if not exists is_tenant_default boolean not null default false,
  add column if not exists is_branch_default boolean not null default false;
create unique index if not exists uq_vehicles_tenant_default
  on public.vehicles (tenant_id) where is_tenant_default and status = 'active';
create unique index if not exists uq_vehicles_branch_default
  on public.vehicles (tenant_id, branch_id)
  where is_branch_default and status = 'active' and branch_id is not null;

alter table public.lessons
  add column if not exists buffer_before_min integer not null default 0,
  add column if not exists appointment_policy_version integer,
  add column if not exists appointment_policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists vehicle_resolution_source text;
alter table public.agenda_appointments
  add column if not exists buffer_before_min integer not null default 0,
  add column if not exists appointment_policy_version integer,
  add column if not exists appointment_policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists vehicle_resolution_source text;

alter table public.lessons
  drop constraint if exists lessons_smart_buffer_before_ck;
alter table public.lessons
  add constraint lessons_smart_buffer_before_ck
  check (buffer_before_min between 0 and 240);
alter table public.agenda_appointments
  drop constraint if exists agenda_appointments_smart_buffer_before_ck;
alter table public.agenda_appointments
  add constraint agenda_appointments_smart_buffer_before_ck
  check (buffer_before_min between 0 and 240);

alter table public.appointment_type_policies enable row level security;
alter table public.appointment_wizard_settings enable row level security;
alter table public.instructor_appointment_preferences enable row level security;
alter table public.appointment_wizard_analytics enable row level security;

drop policy if exists appointment_type_policies_select_members
  on public.appointment_type_policies;
create policy appointment_type_policies_select_members
  on public.appointment_type_policies for select to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists appointment_wizard_settings_select_members
  on public.appointment_wizard_settings;
create policy appointment_wizard_settings_select_members
  on public.appointment_wizard_settings for select to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists instructor_appointment_preferences_select_scope
  on public.instructor_appointment_preferences;
create policy instructor_appointment_preferences_select_scope
  on public.instructor_appointment_preferences for select to authenticated
  using (
    instructor_id = (select auth.uid())
    or public.is_platform_admin()
    or exists (
      select 1 from public.memberships membership
       where membership.user_id = (select auth.uid())
         and membership.tenant_id = instructor_appointment_preferences.tenant_id
         and membership.role in ('tenant_admin', 'planner')
    )
  );

revoke insert, update, delete on public.appointment_type_policies
  from anon, authenticated;
revoke insert, update, delete on public.appointment_wizard_settings
  from anon, authenticated;
revoke insert, update, delete on public.instructor_appointment_preferences
  from anon, authenticated;
revoke all on public.appointment_wizard_analytics from anon, authenticated;
grant select on public.appointment_type_policies,
  public.appointment_wizard_settings,
  public.instructor_appointment_preferences to authenticated, service_role;
grant insert, update, delete on public.appointment_type_policies,
  public.appointment_wizard_settings,
  public.instructor_appointment_preferences to service_role;
grant select, insert, update, delete on public.appointment_wizard_analytics
  to service_role;

comment on table public.appointment_type_policies is
  'Versioned tenant defaults and override boundaries for new appointments.';
comment on table public.instructor_appointment_preferences is
  'Instructor preferences applied only inside tenant appointment policy bounds.';
comment on column public.lessons.appointment_policy_snapshot is
  'Immutable-at-create policy evidence; later tenant changes do not alter this appointment.';

create extension if not exists pg_trgm;
alter table public.maps_usage_events
  drop constraint if exists maps_usage_surface_ck;
alter table public.maps_usage_events
  add constraint maps_usage_surface_ck check (
    surface in (
      'INTAKE', 'STUDENT_PROFILE', 'STUDENT_APP', 'INSTRUCTOR_APP',
      'INSTRUCTOR_APPOINTMENT_WIZARD', 'LESSON_PLANNER', 'PLANNING_BOARD',
      'PLATFORM_ADMIN', 'EXAM', 'BACKGROUND_JOB'
    )
  );
create index if not exists idx_students_tenant_active_name_trgm
  on public.students using gin (lower(full_name) gin_trgm_ops)
  where active = true;

create or replace function public.search_instructor_students(
  p_tenant_id uuid,
  p_actor uuid,
  p_query text,
  p_scope text,
  p_branch_ids uuid[] default null,
  p_limit integer default 10
) returns table (
  id uuid,
  display_name text,
  branch_id uuid,
  relation_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := least(10, greatest(1, coalesce(p_limit, 10)));
  v_is_admin boolean;
  v_is_instructor boolean;
begin
  if char_length(v_query) < 3 then
    return;
  end if;
  if p_scope not in ('OWN_ACTIVE', 'OWN_AND_REPLACEMENT', 'BRANCH_ACTIVE', 'TENANT_ACTIVE') then
    raise exception 'unsupported student scope';
  end if;

  select exists (
    select 1 from public.memberships membership
     where membership.tenant_id = p_tenant_id
       and membership.user_id = p_actor
       and membership.role in ('tenant_admin', 'planner', 'branch_manager', 'franchise_admin')
  ) or exists (
    select 1 from public.profiles profile
     where profile.id = p_actor and profile.is_platform_admin = true
  ) into v_is_admin;
  select exists (
    select 1 from public.memberships membership
     where membership.tenant_id = p_tenant_id
       and membership.user_id = p_actor
       and membership.role = 'instructor'
  ) into v_is_instructor;
  if not v_is_admin and not v_is_instructor then
    raise exception 'actor is not authorized to search students';
  end if;

  return query
  select student.id,
         student.full_name,
         student.branch_id,
         case
           when exists (
             select 1 from public.chat_conversations conversation
              where conversation.tenant_id = p_tenant_id
                and conversation.student_id = student.id
                and conversation.instructor_id = p_actor
           ) then 'Eigen leerling'
           else 'Actieve leerling'
         end
    from public.students student
   where student.tenant_id = p_tenant_id
     and student.active = true
     and lower(student.full_name) like
       ('%' || replace(replace(lower(v_query), '%', '\%'), '_', '\_') || '%') escape '\'
     and (
       v_is_admin
       or p_scope = 'TENANT_ACTIVE'
       or (
         p_scope in ('BRANCH_ACTIVE', 'OWN_AND_REPLACEMENT')
         and p_branch_ids is not null
         and student.branch_id = any(p_branch_ids)
       )
       or (
         p_scope in ('OWN_ACTIVE', 'OWN_AND_REPLACEMENT')
         and (
           exists (
             select 1 from public.lessons lesson
              where lesson.tenant_id = p_tenant_id
                and lesson.student_id = student.id
                and lesson.instructor_id = p_actor
           )
           or exists (
             select 1 from public.agenda_appointments appointment
              where appointment.tenant_id = p_tenant_id
                and appointment.student_id = student.id
                and appointment.instructor_id = p_actor
           )
           or exists (
             select 1 from public.chat_conversations conversation
              where conversation.tenant_id = p_tenant_id
                and conversation.student_id = student.id
                and conversation.instructor_id = p_actor
           )
         )
       )
     )
   order by lower(student.full_name), student.id
   limit v_limit;
end;
$$;

revoke all on function public.search_instructor_students(
  uuid, uuid, text, text, uuid[], integer
) from public, anon, authenticated;
grant execute on function public.search_instructor_students(
  uuid, uuid, text, text, uuid[], integer
) to service_role;

create or replace function public.create_smart_appointment(
  p_tenant_id uuid,
  p_actor uuid,
  p_instructor_id uuid,
  p_type text,
  p_student_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_buffer_before_minutes integer,
  p_buffer_after_minutes integer,
  p_branch_id uuid,
  p_title text,
  p_location text,
  p_notes text,
  p_vehicle_id uuid,
  p_pickup_service_area_id uuid,
  p_policy_version integer,
  p_policy_snapshot jsonb,
  p_vehicle_resolution_source text,
  p_override_reason text,
  p_pickup_location_record_id uuid,
  p_pickup_location_version_id uuid,
  p_pickup_snapshot jsonb,
  p_destination_location_record_id uuid,
  p_destination_location_version_id uuid,
  p_destination_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.appointment_type_policies%rowtype;
  v_student_requirement text;
  v_vehicle_requirement text;
  v_location_requirement text;
  v_min_duration integer;
  v_max_duration integer;
  v_duration_step integer;
  v_default_duration integer;
  v_default_buffer_before integer;
  v_default_buffer_after integer;
  v_min_buffer_before integer;
  v_min_buffer_after integer;
  v_can_override_duration boolean;
  v_can_override_buffer boolean;
  v_blocks_instructor boolean;
  v_blocks_vehicle boolean;
  v_appointment_ends_at timestamptz;
  v_block_ends_at timestamptz;
  v_block_starts_at timestamptz;
  v_balance integer;
  v_id uuid;
  v_kind text;
  v_appointment_type text;
  v_location_record_id uuid;
  v_location_version_id uuid;
  v_snapshot jsonb;
  v_applied_policy_snapshot jsonb;
  v_stop_type text;
begin
  if p_type not in (
    'lesson', 'exam', 'interim_test', 'theory_guidance', 'free_block',
    'break', 'private_block', 'maintenance', 'admin', 'vacation'
  ) then
    raise exception 'unsupported appointment type';
  end if;
  if not exists (
    select 1 from public.memberships membership
     where membership.tenant_id = p_tenant_id
       and membership.user_id = p_actor
       and (
         membership.role in ('tenant_admin', 'planner', 'franchise_admin')
         or (membership.role = 'instructor' and p_instructor_id = p_actor)
       )
  ) and not exists (
    select 1 from public.profiles profile
     where profile.id = p_actor and profile.is_platform_admin = true
  ) then
    raise exception 'actor is not authorized to create this appointment';
  end if;

  select * into v_policy
    from public.appointment_type_policies policy
   where policy.tenant_id = p_tenant_id and policy.code = p_type;
  if found then
    if not v_policy.is_active then raise exception 'appointment type is inactive'; end if;
    if p_policy_version is distinct from v_policy.version then
      raise exception 'appointment policy changed; refresh required';
    end if;
    v_student_requirement := v_policy.student_requirement;
    v_vehicle_requirement := v_policy.vehicle_requirement;
    v_location_requirement := v_policy.location_requirement;
    v_min_duration := v_policy.min_duration_minutes;
    v_max_duration := v_policy.max_duration_minutes;
    v_duration_step := v_policy.duration_step_minutes;
    v_default_duration := v_policy.default_duration_minutes;
    v_default_buffer_before := v_policy.default_buffer_before_minutes;
    v_default_buffer_after := v_policy.default_buffer_after_minutes;
    v_min_buffer_before := v_policy.min_buffer_before_minutes;
    v_min_buffer_after := v_policy.min_buffer_after_minutes;
    v_can_override_duration := v_policy.instructor_can_override_duration;
    v_can_override_buffer := v_policy.instructor_can_override_buffer;
    v_blocks_instructor := v_policy.blocks_instructor_availability;
    v_blocks_vehicle := v_policy.blocks_vehicle_availability;
    v_applied_policy_snapshot := to_jsonb(v_policy)
      - 'tenant_id' - 'created_at' - 'updated_at';
  else
    if coalesce((p_policy_snapshot->>'code'), '') <> p_type then
      raise exception 'invalid platform policy snapshot';
    end if;
    v_student_requirement := p_policy_snapshot->>'studentRequirement';
    v_vehicle_requirement := p_policy_snapshot->>'vehicleRequirement';
    v_location_requirement := p_policy_snapshot->>'locationRequirement';
    v_min_duration := (p_policy_snapshot->>'minDurationMinutes')::integer;
    v_max_duration := (p_policy_snapshot->>'maxDurationMinutes')::integer;
    v_duration_step := (p_policy_snapshot->>'durationStepMinutes')::integer;
    v_default_duration := (p_policy_snapshot->>'defaultDurationMinutes')::integer;
    v_default_buffer_before := (p_policy_snapshot->>'defaultBufferBeforeMinutes')::integer;
    v_default_buffer_after := (p_policy_snapshot->>'defaultBufferAfterMinutes')::integer;
    v_min_buffer_before := (p_policy_snapshot->>'minBufferBeforeMinutes')::integer;
    v_min_buffer_after := (p_policy_snapshot->>'minBufferAfterMinutes')::integer;
    v_can_override_duration := (p_policy_snapshot->>'instructorCanOverrideDuration')::boolean;
    v_can_override_buffer := (p_policy_snapshot->>'instructorCanOverrideBuffer')::boolean;
    v_blocks_instructor := (p_policy_snapshot->>'blocksInstructorAvailability')::boolean;
    v_blocks_vehicle := (p_policy_snapshot->>'blocksVehicleAvailability')::boolean;
    v_applied_policy_snapshot := p_policy_snapshot;
  end if;
  if p_duration_minutes < v_min_duration or p_duration_minutes > v_max_duration then
    raise exception 'duration outside appointment policy';
  end if;
  if mod(p_duration_minutes - v_min_duration, v_duration_step) <> 0 then
    raise exception 'duration does not match appointment policy step';
  end if;
  if p_buffer_before_minutes < v_min_buffer_before or p_buffer_before_minutes > 240
     or p_buffer_after_minutes < v_min_buffer_after or p_buffer_after_minutes > 240 then
    raise exception 'invalid appointment buffer';
  end if;
  if not v_can_override_duration and p_duration_minutes <> v_default_duration then
    raise exception 'appointment duration is locked';
  end if;
  if not v_can_override_buffer and (
    p_buffer_before_minutes <> v_default_buffer_before
    or p_buffer_after_minutes <> v_default_buffer_after
  ) then
    raise exception 'appointment buffer is locked';
  end if;
  if v_student_requirement = 'REQUIRED' and p_student_id is null then
    raise exception 'student is required';
  end if;
  if v_student_requirement = 'FORBIDDEN' and p_student_id is not null then
    raise exception 'student is forbidden';
  end if;
  if (p_pickup_location_record_id is null) <> (p_pickup_location_version_id is null)
     or (p_destination_location_record_id is null) <> (p_destination_location_version_id is null) then
    raise exception 'canonical location reference is incomplete';
  end if;
  if v_location_requirement in ('PICKUP', 'PICKUP_AND_DESTINATION') and not (
    (p_pickup_location_record_id is not null and p_pickup_location_version_id is not null)
    or nullif(btrim(coalesce(p_pickup_snapshot->>'formattedAddress', '')), '') is not null
  ) then
    raise exception 'pickup location is required';
  end if;
  if v_location_requirement in ('DESTINATION', 'PICKUP_AND_DESTINATION') and not (
    (p_destination_location_record_id is not null and p_destination_location_version_id is not null)
    or nullif(btrim(coalesce(p_destination_snapshot->>'formattedAddress', '')), '') is not null
  ) then
    raise exception 'destination location is required';
  end if;
  if (
    v_vehicle_requirement = 'REQUIRED'
    or (
      v_vehicle_requirement = 'AUTO'
      and coalesce((
        select settings.vehicle_required
          from public.appointment_wizard_settings settings
         where settings.tenant_id = p_tenant_id
      ), true)
    )
  ) and p_vehicle_id is null then
    raise exception 'vehicle is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':instructor:' || p_instructor_id::text, 0));
  if p_student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':student:' || p_student_id::text, 0));
  end if;
  if p_vehicle_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':vehicle:' || p_vehicle_id::text, 0));
  end if;

  if not exists (
    select 1 from public.memberships membership
     where membership.tenant_id = p_tenant_id
       and membership.user_id = p_instructor_id
       and membership.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor is not a member of tenant';
  end if;
  if p_student_id is not null then
    perform 1 from public.students student
     where student.id = p_student_id
       and student.tenant_id = p_tenant_id
       and student.active = true
     for update;
    if not found then raise exception 'student is not active in tenant'; end if;
    if p_branch_id is not null and exists (
      select 1 from public.students student
       where student.id = p_student_id
         and student.tenant_id = p_tenant_id
         and student.branch_id is distinct from p_branch_id
    ) then
      raise exception 'student branch does not match appointment branch';
    end if;
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches branch
     where branch.id = p_branch_id and branch.tenant_id = p_tenant_id
  ) then
    raise exception 'branch does not belong to tenant';
  end if;

  v_block_starts_at := p_starts_at - make_interval(mins => p_buffer_before_minutes);
  v_appointment_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);
  v_block_ends_at := v_appointment_ends_at + make_interval(mins => p_buffer_after_minutes);

  if v_blocks_instructor and (exists (
    select 1 from public.lessons lesson
     where lesson.tenant_id = p_tenant_id
       and lesson.instructor_id = p_instructor_id
       and lesson.status = 'planned'
       and tstzrange(
         lesson.starts_at - make_interval(mins => coalesce(lesson.buffer_before_min, 0)),
         lesson.ends_at + make_interval(mins => coalesce(lesson.buffer_min, 0)), '[)'
       ) && tstzrange(v_block_starts_at, v_block_ends_at, '[)')
  ) or exists (
    select 1 from public.trial_lessons trial
     where trial.tenant_id = p_tenant_id
       and trial.instructor_id = p_instructor_id
       and trial.status in ('provisional', 'confirmed')
       and tstzrange(trial.starts_at, trial.ends_at, '[)')
           && tstzrange(v_block_starts_at, v_block_ends_at, '[)')
  ) or exists (
    select 1 from public.agenda_appointments appointment
     where appointment.tenant_id = p_tenant_id
       and appointment.instructor_id = p_instructor_id
       and appointment.status = 'planned'
       and tstzrange(
         appointment.starts_at - make_interval(mins => coalesce(appointment.buffer_before_min, 0)),
         appointment.ends_at + make_interval(mins => coalesce(appointment.buffer_min, 0)), '[)'
       ) && tstzrange(v_block_starts_at, v_block_ends_at, '[)')
  )) then
    raise exception 'instructor has an overlapping appointment or buffer';
  end if;
  if p_student_id is not null and (
    exists (
      select 1 from public.lessons lesson
       where lesson.tenant_id = p_tenant_id
         and lesson.student_id = p_student_id
         and lesson.status = 'planned'
         and tstzrange(lesson.starts_at, lesson.ends_at, '[)') && tstzrange(p_starts_at, v_appointment_ends_at, '[)')
    ) or exists (
      select 1 from public.agenda_appointments appointment
       where appointment.tenant_id = p_tenant_id
         and appointment.student_id = p_student_id
         and appointment.status = 'planned'
         and tstzrange(appointment.starts_at, appointment.ends_at, '[)') && tstzrange(p_starts_at, v_appointment_ends_at, '[)')
    )
  ) then
    raise exception 'student has an overlapping appointment';
  end if;
  if p_vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles vehicle
       where vehicle.id = p_vehicle_id and vehicle.tenant_id = p_tenant_id
         and vehicle.active = true and coalesce(vehicle.status, 'active') = 'active'
    ) then raise exception 'vehicle is not active'; end if;
    if p_branch_id is not null and exists (
      select 1 from public.vehicles vehicle
       where vehicle.id = p_vehicle_id
         and vehicle.tenant_id = p_tenant_id
         and vehicle.branch_id is not null
         and vehicle.branch_id is distinct from p_branch_id
    ) then raise exception 'vehicle branch does not match appointment branch'; end if;
    if v_blocks_vehicle and (exists (
      select 1 from public.lessons lesson
       where lesson.tenant_id = p_tenant_id and lesson.vehicle_id = p_vehicle_id
         and lesson.status = 'planned'
         and tstzrange(
           lesson.starts_at - make_interval(mins => coalesce(lesson.buffer_before_min, 0)),
           lesson.ends_at + make_interval(mins => coalesce(lesson.buffer_min, 0)), '[)'
         ) && tstzrange(v_block_starts_at, v_block_ends_at, '[)')
    ) or exists (
      select 1 from public.agenda_appointments appointment
       where appointment.tenant_id = p_tenant_id and appointment.vehicle_id = p_vehicle_id
         and appointment.status = 'planned'
         and tstzrange(
           appointment.starts_at - make_interval(mins => coalesce(appointment.buffer_before_min, 0)),
           appointment.ends_at + make_interval(mins => coalesce(appointment.buffer_min, 0)), '[)'
         ) && tstzrange(v_block_starts_at, v_block_ends_at, '[)')
    ) or exists (
      select 1 from public.vehicle_maintenance_events maintenance
       where maintenance.tenant_id = p_tenant_id and maintenance.vehicle_id = p_vehicle_id
         and maintenance.blocks_planning = true
         and maintenance.status = 'planned'
         and tstzrange(maintenance.starts_at, maintenance.ends_at, '[)') && tstzrange(v_block_starts_at, v_block_ends_at, '[)')
    )) then raise exception 'vehicle is not available'; end if;
  end if;

  if p_type = 'lesson' then
    select coalesce(sum(ledger.delta), 0)::integer into v_balance
      from public.credit_ledger ledger
     where ledger.student_id = p_student_id and ledger.tenant_id = p_tenant_id;
    if v_balance < p_duration_minutes then
      raise exception 'insufficient lesson credit';
    end if;
    insert into public.lessons (
      tenant_id, branch_id, instructor_id, student_id, starts_at, ends_at,
      status, location, notes, credits_cost, created_by, duration_min,
      buffer_before_min, buffer_min, vehicle_id, appointment_policy_version,
      appointment_policy_snapshot, vehicle_resolution_source
    ) values (
      p_tenant_id, p_branch_id, p_instructor_id, p_student_id, p_starts_at,
      v_appointment_ends_at, 'planned', p_location, p_notes,
      p_duration_minutes, p_actor, p_duration_minutes, p_buffer_before_minutes,
      p_buffer_after_minutes, p_vehicle_id, p_policy_version,
      v_applied_policy_snapshot, p_vehicle_resolution_source
    ) returning id into v_id;
    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, p_student_id, -p_duration_minutes, 'lesson_consumed',
      'lesson', v_id, 'Les ingepland via afspraakwizard', p_actor
    );
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'lesson.scheduled', 'lesson', v_id::text,
      jsonb_build_object(
        'instructor_id', p_instructor_id, 'student_id', p_student_id,
        'starts_at', p_starts_at, 'ends_at', v_appointment_ends_at,
        'duration_min', p_duration_minutes, 'credits_cost', p_duration_minutes,
        'source', 'SMART_APPOINTMENT_WIZARD'
      )
    );
    v_kind := 'lesson';
  else
    if not public._agenda_appointment_actor_authorized(
      p_actor, p_tenant_id, p_instructor_id, p_branch_id
    ) then
      raise exception 'actor is not authorized for appointment branch';
    end if;
    if p_pickup_service_area_id is not null and not exists (
      select 1 from public.service_areas area
       where area.id = p_pickup_service_area_id
         and area.tenant_id = p_tenant_id
         and area.active = true
         and (area.branch_id is null or area.branch_id = p_branch_id)
    ) then
      raise exception 'pickup area does not match appointment branch';
    end if;
    insert into public.agenda_appointments (
      tenant_id, branch_id, instructor_id, student_id, type, status,
      starts_at, ends_at, duration_min, buffer_before_min, buffer_min,
      title, location, notes, vehicle_id, pickup_service_area_id, created_by,
      appointment_policy_version, appointment_policy_snapshot,
      vehicle_resolution_source
    ) values (
      p_tenant_id, p_branch_id, p_instructor_id, p_student_id,
      p_type::public.agenda_appointment_type, 'planned', p_starts_at,
      v_appointment_ends_at, p_duration_minutes, p_buffer_before_minutes,
      p_buffer_after_minutes, p_title, p_location, p_notes, p_vehicle_id,
      p_pickup_service_area_id, p_actor, p_policy_version,
      v_applied_policy_snapshot, p_vehicle_resolution_source
    ) returning id into v_id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'agenda_appointment.created',
      'agenda_appointment', v_id::text,
      jsonb_build_object(
        'type', p_type, 'branch_id', p_branch_id,
        'instructor_id', p_instructor_id, 'student_id', p_student_id,
        'vehicle_id', p_vehicle_id, 'pickup_service_area_id', p_pickup_service_area_id,
        'starts_at', p_starts_at, 'ends_at', v_appointment_ends_at,
        'source', 'SMART_APPOINTMENT_WIZARD'
      )
    );
    v_kind := p_type;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'appointment.smart_wizard_created', v_kind,
    v_id::text, jsonb_build_object(
      'policy_version', p_policy_version,
      'duration_minutes', p_duration_minutes,
      'buffer_before_minutes', p_buffer_before_minutes,
      'buffer_after_minutes', p_buffer_after_minutes,
      'vehicle_resolution_source', p_vehicle_resolution_source,
      'planning_override', p_override_reason is not null,
      'override_reason', p_override_reason
    )
  );

  v_appointment_type := case
    when p_type = 'lesson' then 'LESSON'
    when p_type = 'exam' then 'EXAM'
    else 'AGENDA_APPOINTMENT'
  end;
  for v_stop_type, v_location_record_id, v_location_version_id, v_snapshot in
    select * from (values
      ('PICKUP'::text, p_pickup_location_record_id, p_pickup_location_version_id, p_pickup_snapshot),
      ('DESTINATION'::text, p_destination_location_record_id, p_destination_location_version_id, p_destination_snapshot)
    ) as requested_stops(stop_type, location_record_id, location_version_id, snapshot)
  loop
    if v_location_record_id is not null and v_location_version_id is not null then
      perform public.publish_appointment_stop(
        p_tenant_id, p_actor, v_appointment_type, v_id, v_stop_type, 0,
        v_location_record_id, v_location_version_id
      );
    elsif v_snapshot is not null
      and nullif(btrim(coalesce(v_snapshot->>'formattedAddress', '')), '') is not null then
      insert into public.location_records (tenant_id, status, created_by)
      values (p_tenant_id, 'ACTIVE', p_actor)
      returning id into v_location_record_id;

      insert into public.location_versions (
        tenant_id, location_record_id, version_number, label, formatted_address,
        street, house_number, house_number_addition, postal_code, city, region,
        country_code, latitude, longitude, source, provider, provider_place_id,
        validation_status, provider_obtained_at, change_reason, created_by
      ) values (
        p_tenant_id, v_location_record_id, 1,
        left(coalesce(nullif(v_snapshot->>'label', ''), initcap(lower(v_stop_type))), 160),
        left(v_snapshot->>'formattedAddress', 500),
        nullif(v_snapshot->>'street', ''), nullif(v_snapshot->>'houseNumber', ''),
        nullif(v_snapshot->>'houseNumberAddition', ''), nullif(v_snapshot->>'postalCode', ''),
        nullif(v_snapshot->>'city', ''), nullif(v_snapshot->>'region', ''),
        upper(coalesce(nullif(v_snapshot->>'countryCode', ''), 'NL')),
        nullif(v_snapshot->>'latitude', '')::double precision,
        nullif(v_snapshot->>'longitude', '')::double precision,
        case when v_snapshot->>'source' in ('GOOGLE_PLACES', 'USER_CONFIRMED')
          then v_snapshot->>'source' else 'USER_ENTERED' end,
        case when v_snapshot->>'provider' = 'GOOGLE' then 'GOOGLE' else null end,
        case when v_snapshot->>'provider' = 'GOOGLE' then nullif(v_snapshot->>'providerPlaceId', '') else null end,
        case when v_snapshot->>'validationStatus' in (
          'UNVALIDATED', 'VALID', 'PARTIAL', 'REVIEW_REQUIRED', 'INVALID'
        ) then v_snapshot->>'validationStatus' else 'UNVALIDATED' end,
        case when v_snapshot->>'provider' = 'GOOGLE' then now() else null end,
        nullif(v_snapshot->>'changeReason', ''), p_actor
      ) returning id into v_location_version_id;

      update public.location_records
         set canonical_version_id = v_location_version_id
       where id = v_location_record_id and tenant_id = p_tenant_id;

      perform public.publish_appointment_stop(
        p_tenant_id, p_actor, v_appointment_type, v_id, v_stop_type, 0,
        v_location_record_id, v_location_version_id
      );
    end if;
  end loop;
  return jsonb_build_object('id', v_id, 'kind', v_kind);
end;
$$;

revoke all on function public.create_smart_appointment(
  uuid, uuid, uuid, text, uuid, timestamptz, integer, integer, integer,
  uuid, text, text, text, uuid, uuid, integer, jsonb, text, text,
  uuid, uuid, jsonb, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_smart_appointment(
  uuid, uuid, uuid, text, uuid, timestamptz, integer, integer, integer,
  uuid, text, text, text, uuid, uuid, integer, jsonb, text, text,
  uuid, uuid, jsonb, uuid, uuid, jsonb
) to service_role;
