-- Sprint 10 follow-up cluster: collaborative instructor agenda.
--
-- Adds lightweight collaboration metadata to agenda appointments so one item
-- can be visible for:
--   * the owning instructor (`personal`)
--   * a hand-picked staff circle (`shared_staff`)
--   * an operational team (`team`)
--
-- This keeps the existing appointment table and overlap guarantees intact while
-- giving the instructor agenda enough structure for internal blocks, staff-to-
-- staff planning and richer agenda filtering.

do $$ begin
  create type public.agenda_visibility_scope as enum (
    'personal',
    'shared_staff',
    'team'
  );
exception when duplicate_object then null; end $$;

alter table public.agenda_appointments
  add column if not exists team_id uuid references public.organization_teams(id) on delete set null,
  add column if not exists visibility_scope public.agenda_visibility_scope not null default 'personal',
  add column if not exists participant_user_ids uuid[] not null default array[]::uuid[];

create index if not exists idx_agenda_appointments_team
  on public.agenda_appointments (tenant_id, team_id)
  where team_id is not null;

create index if not exists idx_agenda_appointments_visibility_scope
  on public.agenda_appointments (tenant_id, visibility_scope);

create index if not exists idx_agenda_appointments_participants
  on public.agenda_appointments using gin (participant_user_ids);

create or replace function public.agenda_appointment_validate_collaboration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invalid_participant_count integer;
begin
  if new.team_id is not null and not exists (
    select 1
      from public.organization_teams t
     where t.id = new.team_id
       and t.tenant_id = new.tenant_id
  ) then
    raise exception 'team hoort niet bij deze organisatie';
  end if;

  if new.visibility_scope = 'team' and new.team_id is null then
    raise exception 'team visibility vereist een team';
  end if;

  if coalesce(array_length(new.participant_user_ids, 1), 0) > 0 then
    select count(*)
      into v_invalid_participant_count
      from unnest(new.participant_user_ids) participant_user_id
     where not exists (
       select 1
         from public.memberships m
        where m.user_id = participant_user_id
          and m.tenant_id = new.tenant_id
          and m.role not in ('student', 'parent')
     );

    if coalesce(v_invalid_participant_count, 0) > 0 then
      raise exception 'een of meer extra deelnemers horen niet bij deze organisatie';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists agenda_appointment_validate_collaboration on public.agenda_appointments;
create trigger agenda_appointment_validate_collaboration
  before insert or update of tenant_id, team_id, visibility_scope, participant_user_ids
  on public.agenda_appointments
  for each row execute function public.agenda_appointment_validate_collaboration();

comment on column public.agenda_appointments.team_id is
  'Optional operational team for team-visible internal blocks and shared agenda items.';

comment on column public.agenda_appointments.visibility_scope is
  'Controls whether the item is personal, shared with selected staff, or visible to an operational team.';

comment on column public.agenda_appointments.participant_user_ids is
  'Additional staff users involved in the appointment besides the primary instructor.';
