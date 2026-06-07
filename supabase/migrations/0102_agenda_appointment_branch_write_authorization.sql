-- ============================================================================
-- 0102_agenda_appointment_branch_write_authorization.sql
--
-- 0100 added first-class branch_id to agenda appointments. This follow-up keeps
-- the DB write boundary aligned with the app guard without broadening the older
-- _lesson_actor_authorized helper for unrelated lesson RPCs.
-- ============================================================================

create or replace function public._agenda_appointment_actor_authorized(
  p_actor         uuid,
  p_tenant_id     uuid,
  p_instructor_id uuid,
  p_branch_id     uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select p.is_platform_admin from public.profiles p where p.id = p_actor
    ), false)
    or exists (
      select 1 from public.memberships m
       where m.user_id = p_actor
         and m.tenant_id = p_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or (
      p_instructor_id = p_actor
      and exists (
        select 1 from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role = 'instructor'
      )
    )
    or (
      p_branch_id is not null
      and exists (
        select 1 from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role in ('branch_manager', 'planner')
           and (
             coalesce(m.branch_scope_type, 'all') = 'all'
             or exists (
               select 1 from public.membership_branches mb
                where mb.membership_id = m.id
                  and mb.branch_id = p_branch_id
             )
           )
      )
    );
$$;
revoke all on function public._agenda_appointment_actor_authorized(uuid, uuid, uuid, uuid) from public;
revoke execute on function public._agenda_appointment_actor_authorized(uuid, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._agenda_appointment_actor_authorized(uuid, uuid, uuid, uuid) to service_role;

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
  p_branch_id     uuid default null
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
    starts_at, ends_at, title, location, notes, created_by
  ) values (
    p_tenant_id, v_branch_id, p_instructor_id, v_student_id, p_type, 'planned',
    p_starts_at, v_ends_at, p_title, p_location, p_notes, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.created', 'agenda_appointment', v_id::text,
    jsonb_build_object(
      'type',          p_type,
      'branch_id',     v_branch_id,
      'instructor_id', p_instructor_id,
      'student_id',    v_student_id,
      'starts_at',     p_starts_at,
      'ends_at',       v_ends_at
    )
  );

  return v_id;
end;
$$;
revoke all on function public.create_agenda_appointment(uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid) from public;
revoke execute on function public.create_agenda_appointment(uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid) from anon, authenticated;
grant execute on function public.create_agenda_appointment(uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text, uuid) to service_role;

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
  p_branch_id      uuid default null
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
     set branch_id  = v_branch_id,
         starts_at  = p_starts_at,
         ends_at    = v_ends_at,
         student_id = v_student_id,
         title      = p_title,
         location   = p_location,
         notes      = p_notes
   where id = p_appointment_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.updated', 'agenda_appointment', p_appointment_id::text,
    jsonb_build_object(
      'from',       v_appt.starts_at,
      'to',         p_starts_at,
      'ends_at',    v_ends_at,
      'branch_id',  v_branch_id,
      'student_id', v_student_id
    )
  );
end;
$$;
revoke all on function public.update_agenda_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid) from public;
revoke execute on function public.update_agenda_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid) from anon, authenticated;
grant execute on function public.update_agenda_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text, uuid) to service_role;
