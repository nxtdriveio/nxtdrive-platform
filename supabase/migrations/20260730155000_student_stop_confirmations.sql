-- Explicit, auditable learner confirmation of a published lesson stop.

create table if not exists public.appointment_stop_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_stop_id uuid not null
    references public.appointment_stops(id) on delete cascade,
  student_id uuid not null,
  status text not null,
  entry_mode text not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint appointment_stop_confirmation_student_fkey
    foreign key (student_id, tenant_id)
    references public.students(id, tenant_id)
    on delete cascade,
  constraint appointment_stop_confirmation_status_ck
    check (status in ('CONFIRMED', 'CORRECTION_REQUESTED')),
  constraint appointment_stop_confirmation_entry_mode_ck
    check (entry_mode in ('STUDENT', 'STAFF_ASSISTED')),
  unique (appointment_stop_id, student_id)
);

create index if not exists idx_stop_confirmation_student
  on public.appointment_stop_confirmations
  (tenant_id, student_id, confirmed_at desc);

create or replace function public.confirm_student_appointment_stop(
  p_tenant_id uuid,
  p_student_id uuid,
  p_appointment_stop_id uuid,
  p_actor uuid,
  p_entry_mode text default 'STUDENT'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_user_id uuid;
  v_confirmation_id uuid;
begin
  select student.user_id
    into v_student_user_id
    from public.students student
   where student.id = p_student_id
     and student.tenant_id = p_tenant_id;
  if not found then
    raise exception 'student not found in tenant';
  end if;
  if p_entry_mode = 'STUDENT' and v_student_user_id is distinct from p_actor then
    raise exception 'student must confirm their own stop';
  end if;
  if p_entry_mode = 'STAFF_ASSISTED'
     and not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'tenant staff authorization required';
  end if;
  if p_entry_mode not in ('STUDENT', 'STAFF_ASSISTED') then
    raise exception 'invalid confirmation entry mode';
  end if;
  if not exists (
    select 1
      from public.appointment_stops stop
      join public.lessons lesson
        on lesson.id = stop.lesson_id
       and lesson.tenant_id = stop.tenant_id
     where stop.id = p_appointment_stop_id
       and stop.tenant_id = p_tenant_id
       and stop.appointment_type = 'LESSON'
       and stop.publication_status = 'PUBLISHED'
       and lesson.student_id = p_student_id
  ) then
    raise exception 'published student lesson stop not found';
  end if;

  insert into public.appointment_stop_confirmations (
    tenant_id, appointment_stop_id, student_id, status,
    entry_mode, confirmed_by
  ) values (
    p_tenant_id, p_appointment_stop_id, p_student_id, 'CONFIRMED',
    p_entry_mode, p_actor
  )
  on conflict (appointment_stop_id, student_id)
  do update set
    status = 'CONFIRMED',
    entry_mode = excluded.entry_mode,
    confirmed_at = now(),
    confirmed_by = excluded.confirmed_by
  returning id into v_confirmation_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'location.appointment_stop_confirmed',
    'appointment_stop', p_appointment_stop_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'confirmation_id', v_confirmation_id,
      'entry_mode', p_entry_mode
    )
  );
  return v_confirmation_id;
end;
$$;

revoke all on function public.confirm_student_appointment_stop(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.confirm_student_appointment_stop(
  uuid, uuid, uuid, uuid, text
) to service_role;

alter table public.appointment_stop_confirmations enable row level security;

create policy appointment_stop_confirmations_subject_or_staff
  on public.appointment_stop_confirmations for select using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.students student
       where student.id = appointment_stop_confirmations.student_id
         and student.tenant_id = appointment_stop_confirmations.tenant_id
         and student.user_id = auth.uid()
    )
    or public._tenant_staff_authorized(
      auth.uid(),
      appointment_stop_confirmations.tenant_id
    )
    or exists (
      select 1
        from public.student_guardians guardian
       where guardian.student_id = appointment_stop_confirmations.student_id
         and guardian.tenant_id = appointment_stop_confirmations.tenant_id
         and guardian.user_id = auth.uid()
    )
  );

revoke insert, update, delete
  on public.appointment_stop_confirmations from anon, authenticated;
grant select
  on public.appointment_stop_confirmations to authenticated, service_role;
grant insert, update, delete
  on public.appointment_stop_confirmations to service_role;

comment on table public.appointment_stop_confirmations is
  'Auditable learner or staff-assisted confirmation of an immutable published lesson stop.';
