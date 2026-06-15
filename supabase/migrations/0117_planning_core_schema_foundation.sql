-- ============================================================================
-- 0117_planning_core_schema_foundation.sql
--
-- Central Operations Planning Core - schema foundation.
--
-- This migration prepares the database for one shared planning kernel across:
--   * zelfstandige instructeur
--   * multi-vestiging tenant
--   * franchise root / franchisee
--
-- It does NOT yet implement the kernel RPC/service layer itself.
-- It only adds the schema that step 3 will validate against.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend vehicles with operational planning metadata
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists vehicle_type text not null default 'car',
  add column if not exists status text,
  add column if not exists apk_expires_at date,
  add column if not exists insurance_expires_at date,
  add column if not exists current_odometer_km integer,
  add column if not exists default_instructor_id uuid references auth.users(id) on delete set null,
  add column if not exists notes text;

update public.vehicles
   set status = case when active then 'active' else 'inactive' end
 where status is null;

alter table public.vehicles
  alter column status set default 'active';

alter table public.vehicles
  drop constraint if exists vehicles_vehicle_type_ck;
alter table public.vehicles
  add constraint vehicles_vehicle_type_ck
    check (vehicle_type in ('car', 'motorcycle', 'trailer', 'scooter', 'other'));

alter table public.vehicles
  drop constraint if exists vehicles_status_ck;
alter table public.vehicles
  add constraint vehicles_status_ck
    check (status in ('active', 'inactive', 'maintenance', 'damaged', 'sold'));

alter table public.vehicles
  drop constraint if exists vehicles_odometer_ck;
alter table public.vehicles
  add constraint vehicles_odometer_ck
    check (current_odometer_km is null or current_odometer_km >= 0);

create index if not exists idx_vehicles_status
  on public.vehicles (tenant_id, status, branch_id);

create or replace function public._sync_vehicle_active_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is null then
    new.status := case when coalesce(new.active, true) then 'active' else 'inactive' end;
  end if;

  if tg_op = 'INSERT' then
    new.active := (new.status = 'active');
  elsif new.status is distinct from old.status then
    new.active := (new.status = 'active');
  elsif new.active is distinct from old.active then
    if new.active = false and new.status = 'active' then
      new.status := 'inactive';
    elsif new.active = true and new.status = 'inactive' then
      new.status := 'active';
    elsif new.status in ('maintenance', 'damaged', 'sold') then
      new.active := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_vehicle_active_status on public.vehicles;
create trigger trg_sync_vehicle_active_status
  before insert or update of active, status on public.vehicles
  for each row execute function public._sync_vehicle_active_status();

-- ---------------------------------------------------------------------------
-- 2. Vehicle operational event tables
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_odometer_entries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  instructor_id    uuid references auth.users(id) on delete set null,
  source_type      text not null default 'manual',
  source_id        uuid,
  reading_km       integer not null,
  recorded_at      timestamptz not null default now(),
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (reading_km >= 0),
  check (source_type in ('manual', 'lesson_start', 'lesson_end', 'maintenance', 'correction'))
);

create index if not exists idx_vehicle_odometer_entries_vehicle
  on public.vehicle_odometer_entries (vehicle_id, recorded_at desc);

create index if not exists idx_vehicle_odometer_entries_tenant
  on public.vehicle_odometer_entries (tenant_id, recorded_at desc);

alter table public.vehicle_odometer_entries enable row level security;

drop policy if exists vehicle_odometer_entries_select_members on public.vehicle_odometer_entries;
create policy vehicle_odometer_entries_select_members on public.vehicle_odometer_entries
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.vehicle_damage_reports (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  reported_by      uuid references auth.users(id) on delete set null,
  severity         text not null default 'minor',
  status           text not null default 'open',
  occurred_at      timestamptz,
  description      text not null,
  blocks_planning  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (severity in ('minor', 'medium', 'severe')),
  check (status in ('open', 'in_review', 'repaired', 'archived'))
);

create index if not exists idx_vehicle_damage_reports_vehicle
  on public.vehicle_damage_reports (vehicle_id, status, blocks_planning);

create index if not exists idx_vehicle_damage_reports_tenant
  on public.vehicle_damage_reports (tenant_id, status, created_at desc);

drop trigger if exists vehicle_damage_reports_set_updated_at on public.vehicle_damage_reports;
create trigger vehicle_damage_reports_set_updated_at
  before update on public.vehicle_damage_reports
  for each row execute function public.set_updated_at();

alter table public.vehicle_damage_reports enable row level security;

drop policy if exists vehicle_damage_reports_select_members on public.vehicle_damage_reports;
create policy vehicle_damage_reports_select_members on public.vehicle_damage_reports
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.vehicle_maintenance_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  type             text not null,
  status           text not null default 'planned',
  starts_at        timestamptz,
  ends_at          timestamptz,
  odometer_km      integer,
  blocks_planning  boolean not null default true,
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (type in ('apk', 'service', 'repair', 'tire_change', 'inspection', 'other')),
  check (status in ('planned', 'completed', 'cancelled')),
  check (odometer_km is null or odometer_km >= 0),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists idx_vehicle_maintenance_events_vehicle
  on public.vehicle_maintenance_events (vehicle_id, status, starts_at);

create index if not exists idx_vehicle_maintenance_events_tenant
  on public.vehicle_maintenance_events (tenant_id, status, starts_at);

drop trigger if exists vehicle_maintenance_events_set_updated_at on public.vehicle_maintenance_events;
create trigger vehicle_maintenance_events_set_updated_at
  before update on public.vehicle_maintenance_events
  for each row execute function public.set_updated_at();

alter table public.vehicle_maintenance_events enable row level security;

drop policy if exists vehicle_maintenance_events_select_members on public.vehicle_maintenance_events;
create policy vehicle_maintenance_events_select_members on public.vehicle_maintenance_events
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 3. Extend availability with optional branch scope
-- ---------------------------------------------------------------------------
alter table public.instructor_availability
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.instructor_availability_exception
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists idx_instructor_availability_branch
  on public.instructor_availability (tenant_id, branch_id, instructor_id)
  where branch_id is not null;

create index if not exists idx_availability_exception_branch
  on public.instructor_availability_exception (tenant_id, branch_id, instructor_id, exception_date)
  where branch_id is not null;

drop trigger if exists trg_instructor_availability_branch_tenant_check on public.instructor_availability;
create trigger trg_instructor_availability_branch_tenant_check
  before insert or update of branch_id on public.instructor_availability
  for each row execute function public._check_branch_tenant_consistency();

drop trigger if exists trg_instructor_availability_exception_branch_tenant_check on public.instructor_availability_exception;
create trigger trg_instructor_availability_exception_branch_tenant_check
  before insert or update of branch_id on public.instructor_availability_exception
  for each row execute function public._check_branch_tenant_consistency();

-- ---------------------------------------------------------------------------
-- 4. Service areas / rayons
-- ---------------------------------------------------------------------------
create table if not exists public.service_areas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  branch_id      uuid references public.branches(id) on delete set null,
  name           text not null,
  description    text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_service_areas_tenant_branch
  on public.service_areas (tenant_id, branch_id, active);

drop trigger if exists service_areas_set_updated_at on public.service_areas;
create trigger service_areas_set_updated_at
  before update on public.service_areas
  for each row execute function public.set_updated_at();

drop trigger if exists trg_service_areas_branch_tenant_check on public.service_areas;
create trigger trg_service_areas_branch_tenant_check
  before insert or update of branch_id on public.service_areas
  for each row execute function public._check_branch_tenant_consistency();

alter table public.service_areas enable row level security;

drop policy if exists service_areas_select_members on public.service_areas;
create policy service_areas_select_members on public.service_areas
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.service_area_zones (
  id               uuid primary key default gen_random_uuid(),
  service_area_id  uuid not null references public.service_areas(id) on delete cascade,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  type             text not null,
  value            text not null,
  created_at       timestamptz not null default now(),
  check (type in ('city', 'district', 'postcode_prefix', 'custom'))
);

create index if not exists idx_service_area_zones_area
  on public.service_area_zones (service_area_id, type);

create index if not exists idx_service_area_zones_tenant
  on public.service_area_zones (tenant_id, type, value);

alter table public.service_area_zones enable row level security;

drop policy if exists service_area_zones_select_members on public.service_area_zones;
create policy service_area_zones_select_members on public.service_area_zones
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.instructor_service_area_assignments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  instructor_id    uuid not null references auth.users(id) on delete cascade,
  service_area_id  uuid not null references public.service_areas(id) on delete cascade,
  priority         text not null default 'primary',
  valid_from       date,
  valid_until      date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (instructor_id, service_area_id),
  check (priority in ('primary', 'secondary')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists idx_instructor_service_area_assignments_instructor
  on public.instructor_service_area_assignments (tenant_id, instructor_id, priority);

create index if not exists idx_instructor_service_area_assignments_area
  on public.instructor_service_area_assignments (tenant_id, service_area_id);

drop trigger if exists instructor_service_area_assignments_set_updated_at on public.instructor_service_area_assignments;
create trigger instructor_service_area_assignments_set_updated_at
  before update on public.instructor_service_area_assignments
  for each row execute function public.set_updated_at();

alter table public.instructor_service_area_assignments enable row level security;

drop policy if exists instructor_service_area_assignments_select_members on public.instructor_service_area_assignments;
create policy instructor_service_area_assignments_select_members on public.instructor_service_area_assignments
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.service_area_travel_matrix (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  from_service_area_id  uuid not null references public.service_areas(id) on delete cascade,
  to_service_area_id    uuid not null references public.service_areas(id) on delete cascade,
  estimated_minutes     integer not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, from_service_area_id, to_service_area_id),
  check (estimated_minutes between 0 and 600)
);

create index if not exists idx_service_area_travel_matrix_from
  on public.service_area_travel_matrix (tenant_id, from_service_area_id);

create index if not exists idx_service_area_travel_matrix_to
  on public.service_area_travel_matrix (tenant_id, to_service_area_id);

drop trigger if exists service_area_travel_matrix_set_updated_at on public.service_area_travel_matrix;
create trigger service_area_travel_matrix_set_updated_at
  before update on public.service_area_travel_matrix
  for each row execute function public.set_updated_at();

alter table public.service_area_travel_matrix enable row level security;

drop policy if exists service_area_travel_matrix_select_members on public.service_area_travel_matrix;
create policy service_area_travel_matrix_select_members on public.service_area_travel_matrix
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 5. Capability definitions and assignments
-- ---------------------------------------------------------------------------
create table if not exists public.capability_definitions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  key             text not null,
  label           text not null,
  category        text not null,
  applies_to      text not null,
  match_behavior  text not null default 'preferred',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, key),
  check (applies_to in ('instructor', 'vehicle', 'student', 'appointment', 'queue_item')),
  check (match_behavior in ('required', 'preferred', 'informational'))
);

create index if not exists idx_capability_definitions_tenant
  on public.capability_definitions (tenant_id, applies_to, active);

drop trigger if exists capability_definitions_set_updated_at on public.capability_definitions;
create trigger capability_definitions_set_updated_at
  before update on public.capability_definitions
  for each row execute function public.set_updated_at();

alter table public.capability_definitions enable row level security;

drop policy if exists capability_definitions_select_members on public.capability_definitions;
create policy capability_definitions_select_members on public.capability_definitions
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.instructor_capabilities (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  instructor_id  uuid not null references auth.users(id) on delete cascade,
  capability_id  uuid not null references public.capability_definitions(id) on delete cascade,
  value_boolean  boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (instructor_id, capability_id)
);

create index if not exists idx_instructor_capabilities_tenant
  on public.instructor_capabilities (tenant_id, instructor_id);

drop trigger if exists instructor_capabilities_set_updated_at on public.instructor_capabilities;
create trigger instructor_capabilities_set_updated_at
  before update on public.instructor_capabilities
  for each row execute function public.set_updated_at();

alter table public.instructor_capabilities enable row level security;

drop policy if exists instructor_capabilities_select_members on public.instructor_capabilities;
create policy instructor_capabilities_select_members on public.instructor_capabilities
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.vehicle_capabilities (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  capability_id  uuid not null references public.capability_definitions(id) on delete cascade,
  value_boolean  boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (vehicle_id, capability_id)
);

create index if not exists idx_vehicle_capabilities_tenant
  on public.vehicle_capabilities (tenant_id, vehicle_id);

drop trigger if exists vehicle_capabilities_set_updated_at on public.vehicle_capabilities;
create trigger vehicle_capabilities_set_updated_at
  before update on public.vehicle_capabilities
  for each row execute function public.set_updated_at();

alter table public.vehicle_capabilities enable row level security;

drop policy if exists vehicle_capabilities_select_members on public.vehicle_capabilities;
create policy vehicle_capabilities_select_members on public.vehicle_capabilities
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create table if not exists public.student_requirements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  student_id        uuid not null,
  capability_id     uuid not null references public.capability_definitions(id) on delete cascade,
  requirement_type  text not null default 'required',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id, capability_id),
  constraint student_requirements_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (requirement_type in ('required', 'preferred'))
);

create index if not exists idx_student_requirements_tenant
  on public.student_requirements (tenant_id, student_id, requirement_type);

drop trigger if exists student_requirements_set_updated_at on public.student_requirements;
create trigger student_requirements_set_updated_at
  before update on public.student_requirements
  for each row execute function public.set_updated_at();

alter table public.student_requirements enable row level security;

drop policy if exists student_requirements_select_members on public.student_requirements;
create policy student_requirements_select_members on public.student_requirements
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 6. Planning queue
-- ---------------------------------------------------------------------------
create table if not exists public.planning_queue_items (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  branch_id                   uuid references public.branches(id) on delete set null,
  student_id                  uuid,
  lead_id                     uuid,
  appointment_type            text not null,
  duration_minutes            integer not null,
  required_transmission       text,
  preferred_instructor_id     uuid references auth.users(id) on delete set null,
  pickup_service_area_id      uuid references public.service_areas(id) on delete set null,
  desired_date_from           date,
  desired_date_until          date,
  priority                    text not null default 'normal',
  status                      text not null default 'open',
  required_capabilities       jsonb not null default '[]'::jsonb,
  preferred_capabilities      jsonb not null default '[]'::jsonb,
  notes                       text,
  created_by                  uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint planning_queue_items_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  constraint planning_queue_items_lead_tenant_fkey
    foreign key (lead_id, tenant_id)
    references public.leads (id, tenant_id)
    on delete cascade,
  check (duration_minutes between 15 and 720),
  check (student_id is null or lead_id is null),
  check (required_transmission is null or required_transmission in ('schakel', 'automaat')),
  check (priority in ('low', 'normal', 'high', 'urgent')),
  check (status in ('open', 'suggested', 'scheduled', 'cancelled')),
  check (desired_date_until is null or desired_date_from is null or desired_date_until >= desired_date_from),
  check (jsonb_typeof(required_capabilities) = 'array'),
  check (jsonb_typeof(preferred_capabilities) = 'array')
);

create index if not exists idx_planning_queue_items_tenant_status
  on public.planning_queue_items (tenant_id, status, priority, created_at);

create index if not exists idx_planning_queue_items_branch
  on public.planning_queue_items (tenant_id, branch_id, status)
  where branch_id is not null;

create index if not exists idx_planning_queue_items_student
  on public.planning_queue_items (tenant_id, student_id, status)
  where student_id is not null;

create index if not exists idx_planning_queue_items_lead
  on public.planning_queue_items (tenant_id, lead_id, status)
  where lead_id is not null;

drop trigger if exists planning_queue_items_set_updated_at on public.planning_queue_items;
create trigger planning_queue_items_set_updated_at
  before update on public.planning_queue_items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_planning_queue_items_branch_tenant_check on public.planning_queue_items;
create trigger trg_planning_queue_items_branch_tenant_check
  before insert or update of branch_id on public.planning_queue_items
  for each row execute function public._check_branch_tenant_consistency();

alter table public.planning_queue_items enable row level security;

drop policy if exists planning_queue_items_select_members on public.planning_queue_items;
create policy planning_queue_items_select_members on public.planning_queue_items
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 7. Planning audit log
-- ---------------------------------------------------------------------------
create table if not exists public.planning_audit_log (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  branch_id                uuid references public.branches(id) on delete set null,
  franchise_root_tenant_id uuid references public.tenants(id) on delete set null,
  actor_user_id            uuid references auth.users(id) on delete set null,
  actor_role               text,
  scope_type               text not null,
  scope_ref_id             uuid,
  action                   text not null,
  entity_type              text not null,
  entity_id                uuid,
  before_json              jsonb,
  after_json               jsonb,
  reason                   text,
  created_at               timestamptz not null default now(),
  check (scope_type in ('tenant', 'branch', 'franchise_root', 'franchisee'))
);

create index if not exists idx_planning_audit_log_tenant
  on public.planning_audit_log (tenant_id, created_at desc);

create index if not exists idx_planning_audit_log_entity
  on public.planning_audit_log (entity_type, entity_id, created_at desc);

create index if not exists idx_planning_audit_log_actor
  on public.planning_audit_log (actor_user_id, created_at desc);

drop trigger if exists trg_planning_audit_log_branch_tenant_check on public.planning_audit_log;
create trigger trg_planning_audit_log_branch_tenant_check
  before insert or update of branch_id on public.planning_audit_log
  for each row execute function public._check_branch_tenant_consistency();

alter table public.planning_audit_log enable row level security;

drop policy if exists planning_audit_log_select_members on public.planning_audit_log;
create policy planning_audit_log_select_members on public.planning_audit_log
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or franchise_root_tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create or replace function public.planning_audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'planning_audit_log is insert-only';
end;
$$;

drop trigger if exists planning_audit_log_no_update on public.planning_audit_log;
create trigger planning_audit_log_no_update
  before update on public.planning_audit_log
  for each row execute function public.planning_audit_log_block_mutation();

drop trigger if exists planning_audit_log_no_delete on public.planning_audit_log;
create trigger planning_audit_log_no_delete
  before delete on public.planning_audit_log
  for each row execute function public.planning_audit_log_block_mutation();

-- ---------------------------------------------------------------------------
-- 8. Franchise operational delegation
-- ---------------------------------------------------------------------------
create table if not exists public.franchise_operations_permissions (
  id                                  uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id            uuid not null references public.tenants(id) on delete cascade,
  franchisee_tenant_id                uuid not null references public.tenants(id) on delete cascade,
  can_view_planning                   boolean not null default true,
  can_manage_planning                 boolean not null default false,
  can_manage_leads                    boolean not null default false,
  can_manage_templates                boolean not null default false,
  can_view_fleet                      boolean not null default true,
  can_manage_fleet                    boolean not null default false,
  can_view_instructor_availability    boolean not null default true,
  can_manage_instructor_availability  boolean not null default false,
  created_at                          timestamptz not null default now(),
  updated_at                          timestamptz not null default now(),
  unique (franchise_root_tenant_id, franchisee_tenant_id),
  check (franchise_root_tenant_id <> franchisee_tenant_id)
);

create index if not exists idx_franchise_operations_permissions_root
  on public.franchise_operations_permissions (franchise_root_tenant_id);

create index if not exists idx_franchise_operations_permissions_franchisee
  on public.franchise_operations_permissions (franchisee_tenant_id);

drop trigger if exists franchise_operations_permissions_set_updated_at on public.franchise_operations_permissions;
create trigger franchise_operations_permissions_set_updated_at
  before update on public.franchise_operations_permissions
  for each row execute function public.set_updated_at();

alter table public.franchise_operations_permissions enable row level security;

drop policy if exists franchise_operations_permissions_select on public.franchise_operations_permissions;
create policy franchise_operations_permissions_select on public.franchise_operations_permissions
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.tenant_id = franchise_operations_permissions.franchise_root_tenant_id
        and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.tenant_id = franchise_operations_permissions.franchisee_tenant_id
        and m.role in ('tenant_admin', 'franchise_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Extend planning entities with vehicle / location / service-area anchors
-- ---------------------------------------------------------------------------
alter table public.lessons
  add column if not exists pickup_service_area_id uuid references public.service_areas(id) on delete set null;

create index if not exists idx_lessons_pickup_service_area
  on public.lessons (tenant_id, pickup_service_area_id)
  where pickup_service_area_id is not null;

alter table public.trial_lessons
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists pickup_service_area_id uuid references public.service_areas(id) on delete set null;

create index if not exists idx_trial_lessons_pickup_service_area
  on public.trial_lessons (tenant_id, pickup_service_area_id)
  where pickup_service_area_id is not null;

alter table public.agenda_appointments
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists pickup_service_area_id uuid references public.service_areas(id) on delete set null;

create index if not exists idx_agenda_appointments_pickup_service_area
  on public.agenda_appointments (tenant_id, pickup_service_area_id)
  where pickup_service_area_id is not null;

-- ---------------------------------------------------------------------------
-- 10. Comments to document backward-compatible intent
-- ---------------------------------------------------------------------------
comment on table public.planning_queue_items is
  'Queue of unscheduled or to-be-suggested planning objects. Foundation for drag/drop planner.';

comment on table public.planning_audit_log is
  'Planning-specific immutable audit stream with before/after snapshots and delegated-scope metadata.';

comment on table public.franchise_operations_permissions is
  'Delegated operational rights from a franchisee tenant to its franchise root tenant.';

comment on column public.vehicles.status is
  'Operational planning status. The legacy active flag remains for backward compatibility and is synchronized.';

comment on column public.lessons.pickup_service_area_id is
  'Optional normalized rayon/service-area anchor used by the future planning kernel.';

comment on column public.trial_lessons.pickup_service_area_id is
  'Optional normalized rayon/service-area anchor used by the future planning kernel.';

comment on column public.agenda_appointments.pickup_service_area_id is
  'Optional normalized rayon/service-area anchor used by the future planning kernel.';

-- ---------------------------------------------------------------------------
-- 11. Reference consistency guards for new planning schema
-- ---------------------------------------------------------------------------
create or replace function public._planning_reference_tenant_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_data                  jsonb := to_jsonb(new);
  v_tenant_id             uuid := nullif(v_data->>'tenant_id', '')::uuid;
  v_vehicle_id            uuid := nullif(v_data->>'vehicle_id', '')::uuid;
  v_location_id           uuid := nullif(v_data->>'location_id', '')::uuid;
  v_pickup_service_area   uuid := nullif(v_data->>'pickup_service_area_id', '')::uuid;
  v_service_area_id       uuid := nullif(v_data->>'service_area_id', '')::uuid;
  v_from_service_area_id  uuid := nullif(v_data->>'from_service_area_id', '')::uuid;
  v_to_service_area_id    uuid := nullif(v_data->>'to_service_area_id', '')::uuid;
  v_capability_id         uuid := nullif(v_data->>'capability_id', '')::uuid;
  v_instructor_id         uuid := coalesce(
    nullif(v_data->>'instructor_id', '')::uuid,
    nullif(v_data->>'preferred_instructor_id', '')::uuid,
    nullif(v_data->>'default_instructor_id', '')::uuid
  );
  v_ref_tenant_id         uuid;
begin
  if v_tenant_id is null then
    return new;
  end if;

  if v_vehicle_id is not null then
    select tenant_id into v_ref_tenant_id from public.vehicles where id = v_vehicle_id;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'vehicle reference belongs to a different tenant';
    end if;
  end if;

  if v_location_id is not null then
    select tenant_id into v_ref_tenant_id from public.locations where id = v_location_id;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'location reference belongs to a different tenant';
    end if;
  end if;

  if v_pickup_service_area is not null then
    select tenant_id into v_ref_tenant_id from public.service_areas where id = v_pickup_service_area;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'pickup service area belongs to a different tenant';
    end if;
  end if;

  if v_service_area_id is not null then
    select tenant_id into v_ref_tenant_id from public.service_areas where id = v_service_area_id;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'service area reference belongs to a different tenant';
    end if;
  end if;

  if v_from_service_area_id is not null then
    select tenant_id into v_ref_tenant_id from public.service_areas where id = v_from_service_area_id;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'from_service_area belongs to a different tenant';
    end if;
  end if;

  if v_to_service_area_id is not null then
    select tenant_id into v_ref_tenant_id from public.service_areas where id = v_to_service_area_id;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'to_service_area belongs to a different tenant';
    end if;
  end if;

  if v_capability_id is not null then
    select tenant_id into v_ref_tenant_id from public.capability_definitions where id = v_capability_id;
    if v_ref_tenant_id is distinct from v_tenant_id then
      raise exception 'capability reference belongs to a different tenant';
    end if;
  end if;

  if v_instructor_id is not null and not exists (
    select 1
    from public.memberships m
    where m.user_id = v_instructor_id
      and m.tenant_id = v_tenant_id
  ) then
    raise exception 'instructor reference is not a member of this tenant';
  end if;

  return new;
end;
$$;

create or replace function public._planning_franchise_permission_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tenants t
    where t.id = new.franchisee_tenant_id
      and t.parent_tenant_id = new.franchise_root_tenant_id
  ) then
    raise exception 'franchisee tenant must currently be linked to the franchise root tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vehicles_planning_reference_tenant_check on public.vehicles;
create trigger trg_vehicles_planning_reference_tenant_check
  before insert or update of tenant_id, default_instructor_id on public.vehicles
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_vehicle_odometer_entries_reference_tenant_check on public.vehicle_odometer_entries;
create trigger trg_vehicle_odometer_entries_reference_tenant_check
  before insert or update of tenant_id, vehicle_id, instructor_id on public.vehicle_odometer_entries
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_vehicle_damage_reports_reference_tenant_check on public.vehicle_damage_reports;
create trigger trg_vehicle_damage_reports_reference_tenant_check
  before insert or update of tenant_id, vehicle_id on public.vehicle_damage_reports
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_vehicle_maintenance_events_reference_tenant_check on public.vehicle_maintenance_events;
create trigger trg_vehicle_maintenance_events_reference_tenant_check
  before insert or update of tenant_id, vehicle_id on public.vehicle_maintenance_events
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_service_area_zones_reference_tenant_check on public.service_area_zones;
create trigger trg_service_area_zones_reference_tenant_check
  before insert or update of tenant_id, service_area_id on public.service_area_zones
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_instructor_service_area_assignments_reference_tenant_check on public.instructor_service_area_assignments;
create trigger trg_instructor_service_area_assignments_reference_tenant_check
  before insert or update of tenant_id, instructor_id, service_area_id on public.instructor_service_area_assignments
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_service_area_travel_matrix_reference_tenant_check on public.service_area_travel_matrix;
create trigger trg_service_area_travel_matrix_reference_tenant_check
  before insert or update of tenant_id, from_service_area_id, to_service_area_id on public.service_area_travel_matrix
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_instructor_capabilities_reference_tenant_check on public.instructor_capabilities;
create trigger trg_instructor_capabilities_reference_tenant_check
  before insert or update of tenant_id, instructor_id, capability_id on public.instructor_capabilities
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_vehicle_capabilities_reference_tenant_check on public.vehicle_capabilities;
create trigger trg_vehicle_capabilities_reference_tenant_check
  before insert or update of tenant_id, vehicle_id, capability_id on public.vehicle_capabilities
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_student_requirements_reference_tenant_check on public.student_requirements;
create trigger trg_student_requirements_reference_tenant_check
  before insert or update of tenant_id, capability_id on public.student_requirements
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_planning_queue_items_reference_tenant_check on public.planning_queue_items;
create trigger trg_planning_queue_items_reference_tenant_check
  before insert or update of tenant_id, preferred_instructor_id, pickup_service_area_id on public.planning_queue_items
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_lessons_planning_reference_tenant_check on public.lessons;
create trigger trg_lessons_planning_reference_tenant_check
  before insert or update of tenant_id, vehicle_id, location_id, pickup_service_area_id on public.lessons
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_trial_lessons_planning_reference_tenant_check on public.trial_lessons;
create trigger trg_trial_lessons_planning_reference_tenant_check
  before insert or update of tenant_id, instructor_id, vehicle_id, location_id, pickup_service_area_id on public.trial_lessons
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_agenda_appointments_planning_reference_tenant_check on public.agenda_appointments;
create trigger trg_agenda_appointments_planning_reference_tenant_check
  before insert or update of tenant_id, instructor_id, vehicle_id, location_id, pickup_service_area_id on public.agenda_appointments
  for each row execute function public._planning_reference_tenant_consistency();

drop trigger if exists trg_franchise_operations_permissions_consistency on public.franchise_operations_permissions;
create trigger trg_franchise_operations_permissions_consistency
  before insert or update of franchise_root_tenant_id, franchisee_tenant_id on public.franchise_operations_permissions
  for each row execute function public._planning_franchise_permission_consistency();
