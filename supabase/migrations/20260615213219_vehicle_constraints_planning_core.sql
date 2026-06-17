-- Sprint 3: vehicles become active planning resources.
-- Existing vehicle/location catalog tables are extended rather than duplicated.

alter table public.vehicle_odometer_entries
  add column if not exists appointment_id uuid references public.agenda_appointments(id) on delete set null,
  add column if not exists entry_type text;

update public.vehicle_odometer_entries
   set entry_type = source_type
 where entry_type is null;

alter table public.vehicle_odometer_entries
  alter column entry_type set default 'manual';

alter table public.vehicle_odometer_entries
  drop constraint if exists vehicle_odometer_entries_entry_type_ck;
alter table public.vehicle_odometer_entries
  add constraint vehicle_odometer_entries_entry_type_ck
    check (entry_type in ('manual', 'lesson_start', 'lesson_end', 'maintenance', 'correction'));

create index if not exists idx_vehicle_odometer_entries_appointment
  on public.vehicle_odometer_entries (tenant_id, appointment_id)
  where appointment_id is not null;

create index if not exists idx_agenda_appointments_vehicle_starts
  on public.agenda_appointments (tenant_id, vehicle_id, starts_at)
  where vehicle_id is not null and status = 'planned';

create or replace function public._vehicle_actor_authorized(
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
    );
$$;

revoke all on function public._vehicle_actor_authorized(uuid, uuid, uuid) from public;
revoke execute on function public._vehicle_actor_authorized(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._vehicle_actor_authorized(uuid, uuid, uuid) to service_role;

create or replace function public.upsert_vehicle_operational(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_label text,
  p_license_plate text,
  p_brand text,
  p_model text,
  p_transmission text,
  p_vehicle_type text,
  p_status text,
  p_branch_id uuid,
  p_apk_expires_at date,
  p_insurance_expires_at date,
  p_current_odometer_km integer,
  p_default_instructor_id uuid,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_status text := coalesce(nullif(p_status, ''), 'active');
  v_vehicle_type text := coalesce(nullif(p_vehicle_type, ''), 'car');
begin
  if v_label is null then
    raise exception 'vehicle label cannot be empty';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch % is not part of tenant %', p_branch_id, p_tenant_id;
  end if;
  if p_transmission is not null and p_transmission not in ('schakel', 'automaat') then
    raise exception 'invalid transmission %', p_transmission;
  end if;
  if v_vehicle_type not in ('car', 'motorcycle', 'trailer', 'other') then
    raise exception 'invalid vehicle type %', v_vehicle_type;
  end if;
  if v_status not in ('active', 'inactive', 'maintenance', 'damaged', 'sold') then
    raise exception 'invalid vehicle status %', v_status;
  end if;
  if not public._vehicle_actor_authorized(p_actor, p_tenant_id, p_branch_id) then
    raise exception 'actor % not authorized to manage vehicles in tenant %', p_actor, p_tenant_id;
  end if;

  if p_id is null then
    insert into public.vehicles (
      tenant_id, branch_id, label, license_plate, brand, model, transmission,
      vehicle_type, status, apk_expires_at, insurance_expires_at,
      current_odometer_km, default_instructor_id, notes
    ) values (
      p_tenant_id, p_branch_id, v_label, nullif(trim(coalesce(p_license_plate, '')), ''),
      nullif(trim(coalesce(p_brand, '')), ''), nullif(trim(coalesce(p_model, '')), ''),
      nullif(p_transmission, ''), v_vehicle_type, v_status, p_apk_expires_at,
      p_insurance_expires_at, p_current_odometer_km, p_default_instructor_id, p_notes
    )
    returning id into v_id;
  else
    update public.vehicles
       set branch_id = p_branch_id,
           label = v_label,
           license_plate = nullif(trim(coalesce(p_license_plate, '')), ''),
           brand = nullif(trim(coalesce(p_brand, '')), ''),
           model = nullif(trim(coalesce(p_model, '')), ''),
           transmission = nullif(p_transmission, ''),
           vehicle_type = v_vehicle_type,
           status = v_status,
           apk_expires_at = p_apk_expires_at,
           insurance_expires_at = p_insurance_expires_at,
           current_odometer_km = p_current_odometer_km,
           default_instructor_id = p_default_instructor_id,
           notes = p_notes
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'vehicle % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'vehicle.operational_upserted', 'vehicle', v_id::text,
    jsonb_build_object('branch_id', p_branch_id, 'status', v_status)
  );
  return v_id;
end;
$$;

revoke all on function public.upsert_vehicle_operational(
  uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, date, date, integer, uuid, text
) from public;
revoke execute on function public.upsert_vehicle_operational(
  uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, date, date, integer, uuid, text
) from anon, authenticated;
grant execute on function public.upsert_vehicle_operational(
  uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, date, date, integer, uuid, text
) to service_role;

create or replace function public.set_vehicle_operational_status(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_status text
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
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'vehicle % not found in tenant %', p_id, p_tenant_id;
  end if;
  if p_status not in ('active', 'inactive', 'maintenance', 'damaged', 'sold') then
    raise exception 'invalid vehicle status %', p_status;
  end if;
  if not public._vehicle_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage vehicle %', p_actor, p_id;
  end if;

  update public.vehicles
     set status = p_status
   where id = p_id and tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.set_vehicle_operational_status(uuid, uuid, uuid, text) from public;
revoke execute on function public.set_vehicle_operational_status(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.set_vehicle_operational_status(uuid, uuid, uuid, text) to service_role;

create or replace function public.add_vehicle_odometer_entry(
  p_tenant_id uuid,
  p_actor uuid,
  p_vehicle_id uuid,
  p_instructor_id uuid,
  p_appointment_id uuid,
  p_reading_km integer,
  p_entry_type text,
  p_recorded_at timestamptz,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch_id uuid;
  v_entry_type text := coalesce(nullif(p_entry_type, ''), 'manual');
begin
  select branch_id into v_branch_id
    from public.vehicles
   where id = p_vehicle_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'vehicle % not found in tenant %', p_vehicle_id, p_tenant_id;
  end if;
  if not public._vehicle_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage vehicle %', p_actor, p_vehicle_id;
  end if;
  if p_reading_km is null or p_reading_km < 0 then
    raise exception 'invalid odometer reading %', p_reading_km;
  end if;
  if v_entry_type not in ('manual', 'lesson_start', 'lesson_end', 'maintenance', 'correction') then
    raise exception 'invalid odometer entry type %', v_entry_type;
  end if;

  insert into public.vehicle_odometer_entries (
    tenant_id, vehicle_id, instructor_id, appointment_id, reading_km,
    entry_type, source_type, source_id, recorded_at, notes, created_by
  ) values (
    p_tenant_id, p_vehicle_id, p_instructor_id, p_appointment_id, p_reading_km,
    v_entry_type, v_entry_type, p_appointment_id, coalesce(p_recorded_at, now()), p_notes, p_actor
  )
  returning id into v_id;

  update public.vehicles
     set current_odometer_km = greatest(coalesce(current_odometer_km, 0), p_reading_km)
   where id = p_vehicle_id and tenant_id = p_tenant_id;

  return v_id;
end;
$$;

revoke all on function public.add_vehicle_odometer_entry(
  uuid, uuid, uuid, uuid, uuid, integer, text, timestamptz, text
) from public;
revoke execute on function public.add_vehicle_odometer_entry(
  uuid, uuid, uuid, uuid, uuid, integer, text, timestamptz, text
) from anon, authenticated;
grant execute on function public.add_vehicle_odometer_entry(
  uuid, uuid, uuid, uuid, uuid, integer, text, timestamptz, text
) to service_role;

create or replace function public.upsert_vehicle_damage_report(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_vehicle_id uuid,
  p_severity text,
  p_status text,
  p_occurred_at timestamptz,
  p_description text,
  p_blocks_planning boolean
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
    from public.vehicles
   where id = p_vehicle_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'vehicle % not found in tenant %', p_vehicle_id, p_tenant_id;
  end if;
  if not public._vehicle_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage vehicle %', p_actor, p_vehicle_id;
  end if;
  if p_severity not in ('minor', 'medium', 'severe') then
    raise exception 'invalid damage severity %', p_severity;
  end if;
  if p_status not in ('open', 'in_review', 'repaired', 'archived') then
    raise exception 'invalid damage status %', p_status;
  end if;
  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'damage description cannot be empty';
  end if;

  if p_id is null then
    insert into public.vehicle_damage_reports (
      tenant_id, vehicle_id, reported_by, severity, status, occurred_at,
      description, blocks_planning
    ) values (
      p_tenant_id, p_vehicle_id, p_actor, p_severity, p_status, p_occurred_at,
      p_description, coalesce(p_blocks_planning, false)
    )
    returning id into v_id;
  else
    update public.vehicle_damage_reports
       set severity = p_severity,
           status = p_status,
           occurred_at = p_occurred_at,
           description = p_description,
           blocks_planning = coalesce(p_blocks_planning, false)
     where id = p_id and tenant_id = p_tenant_id and vehicle_id = p_vehicle_id
    returning id into v_id;
    if v_id is null then
      raise exception 'damage report % not found', p_id;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_vehicle_damage_report(
  uuid, uuid, uuid, uuid, text, text, timestamptz, text, boolean
) from public;
revoke execute on function public.upsert_vehicle_damage_report(
  uuid, uuid, uuid, uuid, text, text, timestamptz, text, boolean
) from anon, authenticated;
grant execute on function public.upsert_vehicle_damage_report(
  uuid, uuid, uuid, uuid, text, text, timestamptz, text, boolean
) to service_role;

create or replace function public.upsert_vehicle_maintenance_event(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_vehicle_id uuid,
  p_type text,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_odometer_km integer,
  p_blocks_planning boolean,
  p_notes text
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
    from public.vehicles
   where id = p_vehicle_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'vehicle % not found in tenant %', p_vehicle_id, p_tenant_id;
  end if;
  if not public._vehicle_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized to manage vehicle %', p_actor, p_vehicle_id;
  end if;
  if p_type not in ('apk', 'service', 'repair', 'tire_change', 'inspection', 'other') then
    raise exception 'invalid maintenance type %', p_type;
  end if;
  if p_status not in ('planned', 'completed', 'cancelled') then
    raise exception 'invalid maintenance status %', p_status;
  end if;

  if p_id is null then
    insert into public.vehicle_maintenance_events (
      tenant_id, vehicle_id, type, status, starts_at, ends_at, odometer_km,
      blocks_planning, notes, created_by
    ) values (
      p_tenant_id, p_vehicle_id, p_type, p_status, p_starts_at, p_ends_at,
      p_odometer_km, coalesce(p_blocks_planning, true), p_notes, p_actor
    )
    returning id into v_id;
  else
    update public.vehicle_maintenance_events
       set type = p_type,
           status = p_status,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           odometer_km = p_odometer_km,
           blocks_planning = coalesce(p_blocks_planning, true),
           notes = p_notes
     where id = p_id and tenant_id = p_tenant_id and vehicle_id = p_vehicle_id
    returning id into v_id;
    if v_id is null then
      raise exception 'maintenance event % not found', p_id;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_vehicle_maintenance_event(
  uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, boolean, text
) from public;
revoke execute on function public.upsert_vehicle_maintenance_event(
  uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, boolean, text
) from anon, authenticated;
grant execute on function public.upsert_vehicle_maintenance_event(
  uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, boolean, text
) to service_role;

drop function if exists public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid
);

create or replace function public.create_agenda_appointment(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_instructor_id uuid,
  p_type          public.agenda_appointment_type,
  p_starts_at     timestamptz,
  p_duration_min  integer,
  p_student_id    uuid default null,
  p_title         text default null,
  p_location      text default null,
  p_notes         text default null,
  p_branch_id     uuid default null,
  p_vehicle_id    uuid default null
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
    starts_at, ends_at, title, location, notes, vehicle_id, created_by
  ) values (
    p_tenant_id, v_branch_id, p_instructor_id, v_student_id, p_type, 'planned',
    p_starts_at, v_ends_at, p_title, p_location, p_notes, p_vehicle_id, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.created', 'agenda_appointment', v_id::text,
    jsonb_build_object(
      'type', p_type, 'branch_id', v_branch_id, 'instructor_id', p_instructor_id,
      'student_id', v_student_id, 'vehicle_id', p_vehicle_id,
      'starts_at', p_starts_at, 'ends_at', v_ends_at
    )
  );

  return v_id;
end;
$$;

revoke all on function public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid, uuid
) from public;
revoke execute on function public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid, uuid
) from anon, authenticated;
grant execute on function public.create_agenda_appointment(
  uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid, uuid
) to service_role;

drop function if exists public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid
);

create or replace function public.update_agenda_appointment(
  p_appointment_id uuid,
  p_tenant_id      uuid,
  p_actor          uuid,
  p_starts_at      timestamptz,
  p_duration_min   integer,
  p_student_id     uuid default null,
  p_title          text default null,
  p_location       text default null,
  p_notes          text default null,
  p_branch_id      uuid default null,
  p_vehicle_id     uuid default null
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
         vehicle_id = p_vehicle_id
   where id = p_appointment_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.updated', 'agenda_appointment', p_appointment_id::text,
    jsonb_build_object(
      'from', v_appt.starts_at, 'to', p_starts_at, 'ends_at', v_ends_at,
      'branch_id', v_branch_id, 'student_id', v_student_id, 'vehicle_id', p_vehicle_id
    )
  );
end;
$$;

revoke all on function public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid, uuid
) from public;
revoke execute on function public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid, uuid
) from anon, authenticated;
grant execute on function public.update_agenda_appointment(
  uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid, uuid
) to service_role;
