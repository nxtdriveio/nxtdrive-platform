alter table public.planning_settings
  add column if not exists default_lesson_duration_minutes integer not null default 50,
  add column if not exists default_lesson_buffer_minutes integer not null default 0;

alter table public.planning_settings
  drop constraint if exists planning_settings_default_lesson_duration_minutes_ck;
alter table public.planning_settings
  add constraint planning_settings_default_lesson_duration_minutes_ck
  check (
    default_lesson_duration_minutes between 10 and 240
    and default_lesson_duration_minutes % 10 = 0
  );

alter table public.planning_settings
  drop constraint if exists planning_settings_default_lesson_buffer_minutes_ck;
alter table public.planning_settings
  add constraint planning_settings_default_lesson_buffer_minutes_ck
  check (
    default_lesson_buffer_minutes between 0 and 240
    and default_lesson_buffer_minutes % 10 = 0
  );

alter table public.lessons
  add column if not exists duration_min integer,
  add column if not exists buffer_min integer not null default 0;

update public.lessons
   set duration_min = greatest(
     1,
     round(extract(epoch from (ends_at - starts_at)) / 60.0)::integer
   )
 where duration_min is null;

alter table public.lessons
  alter column duration_min set not null;
alter table public.lessons
  alter column duration_min set default 50;

alter table public.lessons
  drop constraint if exists lessons_duration_buffer_minutes_ck;
alter table public.lessons
  add constraint lessons_duration_buffer_minutes_ck
  check (duration_min >= 1 and buffer_min between 0 and 240);

alter table public.agenda_appointments
  add column if not exists duration_min integer,
  add column if not exists buffer_min integer not null default 0;

update public.agenda_appointments
   set duration_min = greatest(
     1,
     round(extract(epoch from (ends_at - starts_at)) / 60.0)::integer
   )
 where duration_min is null;

alter table public.agenda_appointments
  alter column duration_min set not null;
alter table public.agenda_appointments
  alter column duration_min set default 50;

alter table public.agenda_appointments
  drop constraint if exists agenda_appointments_duration_buffer_minutes_ck;
alter table public.agenda_appointments
  add constraint agenda_appointments_duration_buffer_minutes_ck
  check (duration_min >= 1 and buffer_min between 0 and 240);

create or replace function public.upsert_planning_settings(
  p_tenant_id uuid,
  p_actor uuid,
  p_rayon_policy text,
  p_default_travel_buffer_minutes integer,
  p_same_area_travel_minutes integer,
  p_different_area_travel_minutes integer,
  p_default_lesson_duration_minutes integer,
  p_default_lesson_buffer_minutes integer
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
    different_area_travel_minutes,
    default_lesson_duration_minutes,
    default_lesson_buffer_minutes
  ) values (
    p_tenant_id,
    p_rayon_policy,
    p_default_travel_buffer_minutes,
    p_same_area_travel_minutes,
    p_different_area_travel_minutes,
    p_default_lesson_duration_minutes,
    p_default_lesson_buffer_minutes
  )
  on conflict (tenant_id) do update
     set rayon_policy = excluded.rayon_policy,
         default_travel_buffer_minutes = excluded.default_travel_buffer_minutes,
         same_area_travel_minutes = excluded.same_area_travel_minutes,
         different_area_travel_minutes = excluded.different_area_travel_minutes,
         default_lesson_duration_minutes = excluded.default_lesson_duration_minutes,
         default_lesson_buffer_minutes = excluded.default_lesson_buffer_minutes;
end;
$$;

revoke all on function public.upsert_planning_settings(
  uuid, uuid, text, integer, integer, integer, integer, integer
) from public;
revoke execute on function public.upsert_planning_settings(
  uuid, uuid, text, integer, integer, integer, integer, integer
) from anon, authenticated;
grant execute on function public.upsert_planning_settings(
  uuid, uuid, text, integer, integer, integer, integer, integer
) to service_role;
