-- ============================================================================
-- 0100_agenda_appointment_branch_scope.sql
--
-- Give generic agenda appointments first-class branch assignment.
--
-- Before this migration, branch-scoped backoffice agenda views could only scope
-- lessons/trial lessons directly by branch_id. Generic agenda appointments
-- inferred branch scope from an optional student link, which meant open exam
-- moments and blocks could not be safely managed by branch managers/planners.
-- ============================================================================

alter table public.agenda_appointments
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists idx_agenda_appointments_branch
  on public.agenda_appointments (tenant_id, branch_id, starts_at)
  where branch_id is not null;

drop trigger if exists trg_agenda_appointments_branch_tenant_check on public.agenda_appointments;
create trigger trg_agenda_appointments_branch_tenant_check
  before insert or update of branch_id on public.agenda_appointments
  for each row execute function public._check_branch_tenant_consistency();

-- Existing student-linked appointments inherit the student's branch so scoped
-- staff keep seeing them after the app starts filtering appointments by branch.
update public.agenda_appointments a
   set branch_id = s.branch_id
  from public.students s
 where a.student_id = s.id
   and a.tenant_id = s.tenant_id
   and a.branch_id is null
   and s.branch_id is not null;

-- create_agenda_appointment ---------------------------------------------------
-- Adds p_branch_id while preserving the existing positional call shape through
-- a default trailing argument. Student-linked rows always inherit the student
-- branch; open slots/blocks use the explicitly provided branch.
drop function if exists public.create_agenda_appointment(
  uuid,
  uuid,
  uuid,
  public.agenda_appointment_type,
  timestamptz,
  integer,
  uuid,
  text,
  text,
  text
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
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_duration_min is null or p_duration_min < 5 then
    raise exception 'duur moet minimaal 5 minuten zijn';
  end if;

  -- Instructeur moet lid zijn van de tenant.
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructeur % is geen lid van tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- Leerlingkoppeling alleen voor toegestane types; blok-types forceren NULL.
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

-- update_agenda_appointment ---------------------------------------------------
-- Type and instructor remain immutable. Student-linked rows derive branch from
-- the selected student; open slots/blocks preserve or update branch explicitly.
drop function if exists public.update_agenda_appointment(
  uuid,
  uuid,
  uuid,
  timestamptz,
  integer,
  uuid,
  text,
  text,
  text
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
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
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
