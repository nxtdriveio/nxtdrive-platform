-- Sprint 4: rayon and dynamic capability management for Operations Planning Core.

alter table public.capability_definitions
  drop constraint if exists capability_definitions_category_ck;
alter table public.capability_definitions
  add constraint capability_definitions_category_ck
    check (category in ('transmission', 'specialty', 'language', 'lesson_type', 'certification', 'custom'));

alter table public.capability_definitions
  drop constraint if exists capability_definitions_applies_to_ck;
alter table public.capability_definitions
  add constraint capability_definitions_applies_to_ck
    check (applies_to in ('instructor', 'vehicle', 'student', 'appointment', 'queue_item'));

alter table public.agenda_appointments
  add column if not exists required_capabilities jsonb not null default '[]'::jsonb,
  add column if not exists preferred_capabilities jsonb not null default '[]'::jsonb;

alter table public.agenda_appointments
  drop constraint if exists agenda_appointments_required_capabilities_json_ck;
alter table public.agenda_appointments
  add constraint agenda_appointments_required_capabilities_json_ck
    check (jsonb_typeof(required_capabilities) = 'array');

alter table public.agenda_appointments
  drop constraint if exists agenda_appointments_preferred_capabilities_json_ck;
alter table public.agenda_appointments
  add constraint agenda_appointments_preferred_capabilities_json_ck
    check (jsonb_typeof(preferred_capabilities) = 'array');

create table if not exists public.planning_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  rayon_policy text not null default 'hard_block',
  default_travel_buffer_minutes integer not null default 15,
  same_area_travel_minutes integer not null default 10,
  different_area_travel_minutes integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rayon_policy in ('hard_block', 'warning_only', 'ignore')),
  check (default_travel_buffer_minutes between 0 and 240),
  check (same_area_travel_minutes between 0 and 240),
  check (different_area_travel_minutes between 0 and 240)
);

drop trigger if exists planning_settings_set_updated_at on public.planning_settings;
create trigger planning_settings_set_updated_at
  before update on public.planning_settings
  for each row execute function public.set_updated_at();

alter table public.planning_settings enable row level security;

drop policy if exists planning_settings_select_members on public.planning_settings;
create policy planning_settings_select_members on public.planning_settings
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create or replace function public._planning_config_actor_authorized(
  p_actor uuid,
  p_tenant_id uuid,
  p_branch_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public._tenant_admin_authorized(p_actor, p_tenant_id)
    or exists (
      select 1
        from public.memberships m
       where m.user_id = p_actor
         and m.tenant_id = p_tenant_id
         and m.role = 'franchise_admin'
         and (
           p_branch_id is null
           or coalesce(m.branch_scope_type, 'all') = 'all'
           or exists (
             select 1
               from public.membership_branches mb
              where mb.membership_id = m.id
                and mb.branch_id = p_branch_id
           )
         )
    )
    or (
      p_branch_id is not null
      and exists (
        select 1
          from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role in ('branch_manager', 'planner')
           and (
             coalesce(m.branch_scope_type, 'all') = 'all'
             or exists (
               select 1
                 from public.membership_branches mb
                where mb.membership_id = m.id
                  and mb.branch_id = p_branch_id
             )
           )
      )
    );
$$;

revoke all on function public._planning_config_actor_authorized(uuid, uuid, uuid) from public;
revoke execute on function public._planning_config_actor_authorized(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._planning_config_actor_authorized(uuid, uuid, uuid) to service_role;

create or replace function public.upsert_planning_settings(
  p_tenant_id uuid,
  p_actor uuid,
  p_rayon_policy text,
  p_default_travel_buffer_minutes integer,
  p_same_area_travel_minutes integer,
  p_different_area_travel_minutes integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) and not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'franchise_admin'
  ) then
    raise exception 'actor % not authorized to manage planning settings in tenant %', p_actor, p_tenant_id;
  end if;

  insert into public.planning_settings (
    tenant_id,
    rayon_policy,
    default_travel_buffer_minutes,
    same_area_travel_minutes,
    different_area_travel_minutes
  ) values (
    p_tenant_id,
    p_rayon_policy,
    p_default_travel_buffer_minutes,
    p_same_area_travel_minutes,
    p_different_area_travel_minutes
  )
  on conflict (tenant_id) do update
     set rayon_policy = excluded.rayon_policy,
         default_travel_buffer_minutes = excluded.default_travel_buffer_minutes,
         same_area_travel_minutes = excluded.same_area_travel_minutes,
         different_area_travel_minutes = excluded.different_area_travel_minutes;
end;
$$;

revoke all on function public.upsert_planning_settings(uuid, uuid, text, integer, integer, integer) from public;
revoke execute on function public.upsert_planning_settings(uuid, uuid, text, integer, integer, integer) from anon, authenticated;
grant execute on function public.upsert_planning_settings(uuid, uuid, text, integer, integer, integer) to service_role;

create or replace function public.upsert_service_area(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_branch_id uuid,
  p_name text,
  p_description text,
  p_active boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_name is null then
    raise exception 'service area name cannot be empty';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch % is not part of tenant %', p_branch_id, p_tenant_id;
  end if;
  if not public._planning_config_actor_authorized(p_actor, p_tenant_id, p_branch_id) then
    raise exception 'actor % not authorized to manage service area in tenant %', p_actor, p_tenant_id;
  end if;

  if p_id is null then
    insert into public.service_areas (tenant_id, branch_id, name, description, active)
    values (p_tenant_id, p_branch_id, v_name, p_description, coalesce(p_active, true))
    returning id into v_id;
  else
    update public.service_areas
       set branch_id = p_branch_id,
           name = v_name,
           description = p_description,
           active = coalesce(p_active, true)
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'service area % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.upsert_service_area(uuid, uuid, uuid, uuid, text, text, boolean) from public;
revoke execute on function public.upsert_service_area(uuid, uuid, uuid, uuid, text, text, boolean) from anon, authenticated;
grant execute on function public.upsert_service_area(uuid, uuid, uuid, uuid, text, text, boolean) to service_role;

create or replace function public.upsert_service_area_zone(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_service_area_id uuid,
  p_type text,
  p_value text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch_id uuid;
  v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  select branch_id into v_branch_id
    from public.service_areas
   where id = p_service_area_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'service area % not found in tenant %', p_service_area_id, p_tenant_id;
  end if;
  if not public._planning_config_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage service area zone', p_actor;
  end if;
  if p_type not in ('city', 'district', 'postcode_prefix', 'custom') then
    raise exception 'invalid service area zone type %', p_type;
  end if;
  if v_value is null then
    raise exception 'service area zone value cannot be empty';
  end if;

  if p_id is null then
    insert into public.service_area_zones (tenant_id, service_area_id, type, value)
    values (p_tenant_id, p_service_area_id, p_type, v_value)
    returning id into v_id;
  else
    update public.service_area_zones
       set service_area_id = p_service_area_id,
           type = p_type,
           value = v_value
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'service area zone % not found', p_id;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.upsert_service_area_zone(uuid, uuid, uuid, uuid, text, text) from public;
revoke execute on function public.upsert_service_area_zone(uuid, uuid, uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.upsert_service_area_zone(uuid, uuid, uuid, uuid, text, text) to service_role;

create or replace function public.delete_service_area_zone(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select sa.branch_id into v_branch_id
    from public.service_area_zones z
    join public.service_areas sa on sa.id = z.service_area_id
   where z.id = p_id and z.tenant_id = p_tenant_id;
  if not found then
    raise exception 'service area zone % not found', p_id;
  end if;
  if not public._planning_config_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to delete service area zone', p_actor;
  end if;
  delete from public.service_area_zones
   where id = p_id and tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.delete_service_area_zone(uuid, uuid, uuid) from public;
revoke execute on function public.delete_service_area_zone(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.delete_service_area_zone(uuid, uuid, uuid) to service_role;

create or replace function public.upsert_instructor_service_area_assignment(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_instructor_id uuid,
  p_service_area_id uuid,
  p_priority text,
  p_enabled boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch_id uuid;
begin
  select branch_id into v_branch_id
    from public.service_areas
   where id = p_service_area_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'service area % not found in tenant %', p_service_area_id, p_tenant_id;
  end if;
  if not public._planning_config_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage instructor service areas', p_actor;
  end if;
  if p_priority not in ('primary', 'secondary') then
    raise exception 'invalid priority %', p_priority;
  end if;

  if coalesce(p_enabled, true) = false then
    delete from public.instructor_service_area_assignments
     where tenant_id = p_tenant_id
       and instructor_id = p_instructor_id
       and service_area_id = p_service_area_id;
    return null;
  end if;

  insert into public.instructor_service_area_assignments (
    tenant_id, instructor_id, service_area_id, priority
  ) values (
    p_tenant_id, p_instructor_id, p_service_area_id, p_priority
  )
  on conflict (instructor_id, service_area_id) do update
     set priority = excluded.priority
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_instructor_service_area_assignment(uuid, uuid, uuid, uuid, uuid, text, boolean) from public;
revoke execute on function public.upsert_instructor_service_area_assignment(uuid, uuid, uuid, uuid, uuid, text, boolean) from anon, authenticated;
grant execute on function public.upsert_instructor_service_area_assignment(uuid, uuid, uuid, uuid, uuid, text, boolean) to service_role;

create or replace function public.upsert_service_area_travel_matrix(
  p_tenant_id uuid,
  p_actor uuid,
  p_from_service_area_id uuid,
  p_to_service_area_id uuid,
  p_estimated_minutes integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public._planning_config_actor_authorized(p_actor, p_tenant_id, null) then
    raise exception 'actor % not authorized to manage travel matrix', p_actor;
  end if;
  if p_estimated_minutes is null or p_estimated_minutes < 0 or p_estimated_minutes > 600 then
    raise exception 'invalid estimated minutes %', p_estimated_minutes;
  end if;

  insert into public.service_area_travel_matrix (
    tenant_id, from_service_area_id, to_service_area_id, estimated_minutes
  ) values (
    p_tenant_id, p_from_service_area_id, p_to_service_area_id, p_estimated_minutes
  )
  on conflict (tenant_id, from_service_area_id, to_service_area_id) do update
     set estimated_minutes = excluded.estimated_minutes
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.upsert_service_area_travel_matrix(uuid, uuid, uuid, uuid, integer) from public;
revoke execute on function public.upsert_service_area_travel_matrix(uuid, uuid, uuid, uuid, integer) from anon, authenticated;
grant execute on function public.upsert_service_area_travel_matrix(uuid, uuid, uuid, uuid, integer) to service_role;

create or replace function public.upsert_capability_definition(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_key text,
  p_label text,
  p_category text,
  p_applies_to text,
  p_match_behavior text,
  p_active boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_key text := lower(regexp_replace(trim(coalesce(p_key, '')), '\s+', '_', 'g'));
  v_label text := nullif(trim(coalesce(p_label, '')), '');
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) and not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'franchise_admin'
  ) then
    raise exception 'actor % not authorized to manage capabilities in tenant %', p_actor, p_tenant_id;
  end if;
  if v_key = '' or v_label is null then
    raise exception 'capability key and label are required';
  end if;
  if p_category not in ('transmission', 'specialty', 'language', 'lesson_type', 'certification', 'custom') then
    raise exception 'invalid capability category %', p_category;
  end if;
  if p_applies_to not in ('instructor', 'vehicle', 'student', 'appointment') then
    raise exception 'invalid capability applies_to %', p_applies_to;
  end if;
  if p_match_behavior not in ('required', 'preferred', 'informational') then
    raise exception 'invalid capability match_behavior %', p_match_behavior;
  end if;

  if p_id is null then
    insert into public.capability_definitions (
      tenant_id, key, label, category, applies_to, match_behavior, active
    ) values (
      p_tenant_id, v_key, v_label, p_category, p_applies_to, p_match_behavior, coalesce(p_active, true)
    )
    returning id into v_id;
  else
    update public.capability_definitions
       set key = v_key,
           label = v_label,
           category = p_category,
           applies_to = p_applies_to,
           match_behavior = p_match_behavior,
           active = coalesce(p_active, true)
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'capability % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.upsert_capability_definition(uuid, uuid, uuid, text, text, text, text, text, boolean) from public;
revoke execute on function public.upsert_capability_definition(uuid, uuid, uuid, text, text, text, text, text, boolean) from anon, authenticated;
grant execute on function public.upsert_capability_definition(uuid, uuid, uuid, text, text, text, text, text, boolean) to service_role;

create or replace function public.set_instructor_capability(
  p_tenant_id uuid,
  p_actor uuid,
  p_instructor_id uuid,
  p_capability_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) and not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'franchise_admin'
  ) then
    raise exception 'actor % not authorized to manage instructor capabilities', p_actor;
  end if;
  if coalesce(p_enabled, false) then
    insert into public.instructor_capabilities (tenant_id, instructor_id, capability_id)
    values (p_tenant_id, p_instructor_id, p_capability_id)
    on conflict (instructor_id, capability_id) do update
       set value_boolean = true;
  else
    delete from public.instructor_capabilities
     where tenant_id = p_tenant_id
       and instructor_id = p_instructor_id
       and capability_id = p_capability_id;
  end if;
end;
$$;

revoke all on function public.set_instructor_capability(uuid, uuid, uuid, uuid, boolean) from public;
revoke execute on function public.set_instructor_capability(uuid, uuid, uuid, uuid, boolean) from anon, authenticated;
grant execute on function public.set_instructor_capability(uuid, uuid, uuid, uuid, boolean) to service_role;

create or replace function public.set_vehicle_capability(
  p_tenant_id uuid,
  p_actor uuid,
  p_vehicle_id uuid,
  p_capability_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch_id into v_branch_id
    from public.vehicles
   where id = p_vehicle_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'vehicle % not found in tenant %', p_vehicle_id, p_tenant_id;
  end if;
  if not public._vehicle_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage vehicle capabilities', p_actor;
  end if;
  if coalesce(p_enabled, false) then
    insert into public.vehicle_capabilities (tenant_id, vehicle_id, capability_id)
    values (p_tenant_id, p_vehicle_id, p_capability_id)
    on conflict (vehicle_id, capability_id) do update
       set value_boolean = true;
  else
    delete from public.vehicle_capabilities
     where tenant_id = p_tenant_id
       and vehicle_id = p_vehicle_id
       and capability_id = p_capability_id;
  end if;
end;
$$;

revoke all on function public.set_vehicle_capability(uuid, uuid, uuid, uuid, boolean) from public;
revoke execute on function public.set_vehicle_capability(uuid, uuid, uuid, uuid, boolean) from anon, authenticated;
grant execute on function public.set_vehicle_capability(uuid, uuid, uuid, uuid, boolean) to service_role;

create or replace function public.upsert_student_requirement(
  p_tenant_id uuid,
  p_actor uuid,
  p_student_id uuid,
  p_capability_id uuid,
  p_requirement_type text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch_id into v_branch_id
    from public.students
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;
  if not public._planning_config_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage student requirements', p_actor;
  end if;
  if p_requirement_type not in ('required', 'preferred') then
    raise exception 'invalid requirement_type %', p_requirement_type;
  end if;
  if coalesce(p_enabled, false) then
    insert into public.student_requirements (
      tenant_id, student_id, capability_id, requirement_type, active
    ) values (
      p_tenant_id, p_student_id, p_capability_id, p_requirement_type, true
    )
    on conflict (student_id, capability_id) do update
       set requirement_type = excluded.requirement_type,
           active = true;
  else
    delete from public.student_requirements
     where tenant_id = p_tenant_id
       and student_id = p_student_id
       and capability_id = p_capability_id;
  end if;
end;
$$;

revoke all on function public.upsert_student_requirement(uuid, uuid, uuid, uuid, text, boolean) from public;
revoke execute on function public.upsert_student_requirement(uuid, uuid, uuid, uuid, text, boolean) from anon, authenticated;
grant execute on function public.upsert_student_requirement(uuid, uuid, uuid, uuid, text, boolean) to service_role;

create or replace function public.create_agenda_appointment(
  p_tenant_id               uuid,
  p_actor                   uuid,
  p_instructor_id           uuid,
  p_type                    public.agenda_appointment_type,
  p_starts_at               timestamptz,
  p_duration_min            integer,
  p_student_id              uuid default null,
  p_title                   text default null,
  p_location                text default null,
  p_notes                   text default null,
  p_branch_id               uuid default null,
  p_vehicle_id              uuid default null,
  p_pickup_service_area_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id                uuid;
  v_ends_at           timestamptz;
  v_student_id        uuid;
  v_branch_id         uuid;
  v_student_branch_id uuid;
begin
  if p_duration_min is null or p_duration_min < 5 then
    raise exception 'duur moet minimaal 5 minuten zijn';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructeur % is geen lid van tenant %', p_instructor_id, p_tenant_id;
  end if;

  if public._appointment_type_allows_student(p_type) then
    v_student_id := p_student_id;
  else
    v_student_id := null;
  end if;

  if v_student_id is not null then
    select s.branch_id into v_student_branch_id
      from public.students s
     where s.id = v_student_id and s.tenant_id = p_tenant_id;
    if not found then
      raise exception 'leerling % niet gevonden in tenant %', v_student_id, p_tenant_id;
    end if;
    if p_branch_id is not null and p_branch_id is distinct from v_student_branch_id then
      raise exception 'vestiging van afspraak moet gelijk zijn aan de vestiging van de leerling';
    end if;
    v_branch_id := v_student_branch_id;
  else
    v_branch_id := p_branch_id;
    if v_branch_id is not null and not exists (
      select 1 from public.branches b
       where b.id = v_branch_id and b.tenant_id = p_tenant_id
    ) then
      raise exception 'vestiging % niet gevonden in tenant %', v_branch_id, p_tenant_id;
    end if;
  end if;

  if p_pickup_service_area_id is not null and not exists (
    select 1 from public.service_areas sa
     where sa.id = p_pickup_service_area_id
       and sa.tenant_id = p_tenant_id
       and sa.active = true
       and (sa.branch_id is null or sa.branch_id = v_branch_id)
  ) then
    raise exception 'rayon % past niet binnen deze afspraakscope', p_pickup_service_area_id;
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
     where v.id = p_vehicle_id
       and v.tenant_id = p_tenant_id
       and (v.branch_id is null or v_branch_id is null or v.branch_id = v_branch_id)
  ) then
    raise exception 'voertuig % past niet binnen deze afspraakscope', p_vehicle_id;
  end if;

  if not public._agenda_appointment_actor_authorized(
    p_actor, p_tenant_id, p_instructor_id, v_branch_id
  ) then
    raise exception 'actor % not authorized for agenda appointments in tenant %', p_actor, p_tenant_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  if not public._agenda_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'het gekozen tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  insert into public.agenda_appointments (
    tenant_id, branch_id, instructor_id, student_id, type, status,
    starts_at, ends_at, title, location, notes, vehicle_id,
    pickup_service_area_id, created_by
  ) values (
    p_tenant_id, v_branch_id, p_instructor_id, v_student_id, p_type, 'planned',
    p_starts_at, v_ends_at, p_title, p_location, p_notes, p_vehicle_id,
    p_pickup_service_area_id, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.created', 'agenda_appointment', v_id::text,
    jsonb_build_object(
      'type', p_type, 'branch_id', v_branch_id, 'instructor_id', p_instructor_id,
      'student_id', v_student_id, 'vehicle_id', p_vehicle_id,
      'pickup_service_area_id', p_pickup_service_area_id,
      'starts_at', p_starts_at, 'ends_at', v_ends_at
    )
  );

  return v_id;
end;
$$;

revoke all on function public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid, uuid, uuid
) from public;
revoke execute on function public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid, uuid, uuid
) from anon, authenticated;
grant execute on function public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid, uuid, uuid
) to service_role;

create or replace function public.update_agenda_appointment(
  p_appointment_id          uuid,
  p_tenant_id               uuid,
  p_actor                   uuid,
  p_starts_at               timestamptz,
  p_duration_min            integer,
  p_student_id              uuid default null,
  p_title                   text default null,
  p_location                text default null,
  p_notes                   text default null,
  p_branch_id               uuid default null,
  p_vehicle_id              uuid default null,
  p_pickup_service_area_id  uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt              record;
  v_ends_at           timestamptz;
  v_student_id        uuid;
  v_branch_id         uuid;
  v_student_branch_id uuid;
begin
  if p_duration_min is null or p_duration_min < 5 then
    raise exception 'duur moet minimaal 5 minuten zijn';
  end if;

  select * into v_appt
    from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id
   for update;
  if v_appt.id is null then
    raise exception 'afspraak % niet gevonden in tenant %', p_appointment_id, p_tenant_id;
  end if;
  if v_appt.status <> 'planned' then
    raise exception 'afspraak % is niet gepland (status=%)', p_appointment_id, v_appt.status;
  end if;

  if public._appointment_type_allows_student(v_appt.type) then
    v_student_id := p_student_id;
  else
    v_student_id := null;
  end if;

  if v_student_id is not null then
    select s.branch_id into v_student_branch_id
      from public.students s
     where s.id = v_student_id and s.tenant_id = p_tenant_id;
    if not found then
      raise exception 'leerling % niet gevonden in tenant %', v_student_id, p_tenant_id;
    end if;
    if p_branch_id is not null and p_branch_id is distinct from v_student_branch_id then
      raise exception 'vestiging van afspraak moet gelijk zijn aan de vestiging van de leerling';
    end if;
    v_branch_id := v_student_branch_id;
  else
    v_branch_id := coalesce(p_branch_id, v_appt.branch_id);
    if v_branch_id is not null and not exists (
      select 1 from public.branches b
       where b.id = v_branch_id and b.tenant_id = p_tenant_id
    ) then
      raise exception 'vestiging % niet gevonden in tenant %', v_branch_id, p_tenant_id;
    end if;
  end if;

  if p_pickup_service_area_id is not null and not exists (
    select 1 from public.service_areas sa
     where sa.id = p_pickup_service_area_id
       and sa.tenant_id = p_tenant_id
       and sa.active = true
       and (sa.branch_id is null or sa.branch_id = v_branch_id)
  ) then
    raise exception 'rayon % past niet binnen deze afspraakscope', p_pickup_service_area_id;
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
     where v.id = p_vehicle_id
       and v.tenant_id = p_tenant_id
       and (v.branch_id is null or v_branch_id is null or v.branch_id = v_branch_id)
  ) then
    raise exception 'voertuig % past niet binnen deze afspraakscope', p_vehicle_id;
  end if;

  if not public._agenda_appointment_actor_authorized(
    p_actor, p_tenant_id, v_appt.instructor_id, v_appt.branch_id
  ) or not public._agenda_appointment_actor_authorized(
    p_actor, p_tenant_id, v_appt.instructor_id, v_branch_id
  ) then
    raise exception 'actor % not authorized for agenda appointment %', p_actor, p_appointment_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  if not public._agenda_slot_is_free(
    p_tenant_id, v_appt.instructor_id, p_starts_at, v_ends_at, v_appt.id
  ) then
    raise exception 'het nieuwe tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  update public.agenda_appointments
     set branch_id = v_branch_id,
         starts_at = p_starts_at,
         ends_at = v_ends_at,
         student_id = v_student_id,
         title = p_title,
         location = p_location,
         notes = p_notes,
         vehicle_id = p_vehicle_id,
         pickup_service_area_id = p_pickup_service_area_id
   where id = p_appointment_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.updated', 'agenda_appointment', p_appointment_id::text,
    jsonb_build_object(
      'from', v_appt.starts_at, 'to', p_starts_at, 'ends_at', v_ends_at,
      'branch_id', v_branch_id, 'student_id', v_student_id, 'vehicle_id', p_vehicle_id,
      'pickup_service_area_id', p_pickup_service_area_id
    )
  );
end;
$$;

revoke all on function public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid, uuid, uuid
) from public;
revoke execute on function public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid, uuid, uuid
) from anon, authenticated;
grant execute on function public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid, uuid, uuid
) to service_role;
