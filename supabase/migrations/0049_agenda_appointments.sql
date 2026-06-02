-- 0049_agenda_appointments.sql
-- Agenda als hart van NXTDRIVE — alle afspraaktypes.
--
-- De agenda toonde tot nu toe alleen rijlessen (public.lessons) en proeflessen
-- (public.trial_lessons). Dit model voegt alle overige relevante afspraaktypes
-- toe in één generieke tabel:
--
--   * Leerling-gekoppelde afspraken: examen, tussentijdse toets (TTT),
--     theoriebegeleiding. Deze raken het tegoed (credit_ledger) NIET — dat valt
--     buiten scope (tegoed-in-uren-taak). CBR blijft handmatig (Module 13 Fase 1).
--   * Tijd-bezettende blokken (geen leerling): vrij blok, pauze, privéblokkade,
--     onderhoud, administratie, vakantie. Deze bezetten de agenda zodat er geen
--     les/proefles overheen geboekt kan worden.
--
-- We hergebruiken de bestaande lesstructuur-conventies (tenant_id, instructor_id,
-- tstzrange gist no-overlap, select-only RLS, vergrendelde SECURITY DEFINER
-- RPC's) i.p.v. de lessons-tabel te overladen: lessons heeft tegoed-/leerling-
-- semantiek (NOT NULL student, ledger) die hier niet past.

create extension if not exists btree_gist;

-- Afspraaktypes. Engelse enum-waarden (consistent met lesson_status); NL-labels
-- leven in de applicatielaag (lib/agenda/types.ts).
do $$ begin
  create type public.agenda_appointment_type as enum (
    'exam',            -- praktijkexamen
    'interim_test',    -- tussentijdse toets (TTT)
    'theory_guidance', -- theoriebegeleiding
    'free_block',      -- vrij blok
    'break',           -- pauze
    'private_block',   -- privéblokkade
    'maintenance',     -- onderhoud (voertuig)
    'admin',           -- administratie
    'vacation'         -- vakantie
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agenda_appointment_status as enum (
    'planned',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.agenda_appointments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  instructor_id uuid not null references auth.users(id) on delete cascade,
  -- Leerling alleen voor leerling-gekoppelde types (examen/TTT/theorie); voor
  -- blok-types altijd NULL (afgedwongen in create/update RPC). Tenant-consistent.
  student_id    uuid,
  type          public.agenda_appointment_type not null,
  status        public.agenda_appointment_status not null default 'planned',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  title         text,
  location      text,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint agenda_appointments_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  -- Geen twee geplande afspraken over elkaar voor dezelfde instructeur.
  constraint agenda_appointments_no_overlap
    exclude using gist (
      tenant_id with =,
      instructor_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'planned')
);

drop trigger if exists agenda_appointments_set_updated_at on public.agenda_appointments;
create trigger agenda_appointments_set_updated_at
  before update on public.agenda_appointments
  for each row execute function public.set_updated_at();

create index if not exists idx_agenda_appointments_tenant_starts
  on public.agenda_appointments (tenant_id, starts_at);
create index if not exists idx_agenda_appointments_instructor_starts
  on public.agenda_appointments (instructor_id, starts_at);
create index if not exists idx_agenda_appointments_student_starts
  on public.agenda_appointments (student_id, starts_at);
create index if not exists idx_agenda_appointments_tenant_status
  on public.agenda_appointments (tenant_id, status);

-- RLS ----------------------------------------------------------------------
alter table public.agenda_appointments enable row level security;

drop policy if exists agenda_appointments_select_members on public.agenda_appointments;
create policy agenda_appointments_select_members on public.agenda_appointments
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or student_id in (
      select s.id from public.students s where s.user_id = auth.uid()
    )
  );
-- Geen INSERT/UPDATE/DELETE policies — alle writes via de RPC's hieronder
-- (service_role).

-- Conflictbewaking ---------------------------------------------------------

-- Bezet een geplande afspraak [p_starts, p_ends) tijd voor deze instructeur?
-- Gebruikt door de les- en proefles-guards zodat die niet over een bezet blok
-- (of examen/TTT/theorie) geboekt kunnen worden.
create or replace function public._appointment_overlaps(
  p_tenant_id     uuid,
  p_instructor_id uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agenda_appointments a
     where a.tenant_id = p_tenant_id
       and a.instructor_id = p_instructor_id
       and a.status = 'planned'
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;
revoke all on function public._appointment_overlaps(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public._appointment_overlaps(uuid, uuid, timestamptz, timestamptz) to service_role;

-- Volledige slot-guard voor agenda-afspraken: vrij t.o.v. geplande lessen,
-- actieve proeflessen én andere geplande afspraken (optioneel één afspraak-id
-- uitgesloten, gebruikt bij bewerken).
create or replace function public._agenda_slot_is_free(
  p_tenant_id     uuid,
  p_instructor_id uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_exclude_id    uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.lessons l
     where l.tenant_id = p_tenant_id
       and l.instructor_id = p_instructor_id
       and l.status = 'planned'
       and tstzrange(l.starts_at, l.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  ) and not exists (
    select 1 from public.trial_lessons t
     where t.tenant_id = p_tenant_id
       and t.instructor_id = p_instructor_id
       and t.status in ('provisional', 'confirmed')
       and tstzrange(t.starts_at, t.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  ) and not exists (
    select 1 from public.agenda_appointments a
     where a.tenant_id = p_tenant_id
       and a.instructor_id = p_instructor_id
       and a.status = 'planned'
       and (p_exclude_id is null or a.id <> p_exclude_id)
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;
revoke all on function public._agenda_slot_is_free(uuid, uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public._agenda_slot_is_free(uuid, uuid, timestamptz, timestamptz, uuid) to service_role;

-- Bestaande proefles-guard uitbreiden: óók niet over een bezet agenda-blok.
-- (Lessen + actieve proeflessen blijven zoals voorheen; nu plus afspraken.)
create or replace function public._trial_slot_is_free(
  p_tenant_id     uuid,
  p_instructor_id uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_exclude_id    uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.lessons l
     where l.tenant_id = p_tenant_id
       and l.instructor_id = p_instructor_id
       and l.status = 'planned'
       and tstzrange(l.starts_at, l.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  ) and not exists (
    select 1 from public.trial_lessons t
     where t.tenant_id = p_tenant_id
       and t.instructor_id = p_instructor_id
       and t.status in ('provisional', 'confirmed')
       and (p_exclude_id is null or t.id <> p_exclude_id)
       and tstzrange(t.starts_at, t.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  ) and not exists (
    select 1 from public.agenda_appointments a
     where a.tenant_id = p_tenant_id
       and a.instructor_id = p_instructor_id
       and a.status = 'planned'
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;
revoke all on function public._trial_slot_is_free(uuid, uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public._trial_slot_is_free(uuid, uuid, timestamptz, timestamptz, uuid) to service_role;

-- schedule_lesson opnieuw definiëren (zelfde 12-arg signatuur) met een extra
-- guard: een les mag niet over een bezet agenda-blok (of examen/TTT/theorie)
-- geboekt worden. Body verder identiek aan 0046_tegoed_uren.
create or replace function public.schedule_lesson(
  p_tenant_id        uuid,
  p_actor            uuid,
  p_instructor_id    uuid,
  p_student_id       uuid,
  p_starts_at        timestamptz,
  p_duration_min     integer,
  p_credits_cost     integer default null,
  p_location         text default null,
  p_notes            text default null,
  p_location_lat     double precision default null,
  p_location_lng     double precision default null,
  p_location_place_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson_id uuid;
  v_ends_at   timestamptz;
  v_balance   integer;
  v_cost      integer;
begin
  if p_duration_min is null or p_duration_min < 15 then
    raise exception 'duration must be at least 15 minutes';
  end if;

  -- Tegoed is hour-based: a lesson consumes tegoed equal to its duration in
  -- minutes. p_credits_cost is accepted for signature stability but ignored.
  v_cost := p_duration_min;

  -- Actor must be tenant_admin in this tenant (admins schedule lessons).
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'tenant_admin'
  ) and not exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % is not authorized to schedule in tenant %', p_actor, p_tenant_id;
  end if;

  -- Instructor must belong to the tenant.
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- Lock the student row so concurrent schedules for the same student
  -- serialize on the balance check.
  perform 1
    from public.students
   where id = p_student_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Balance check (sum of ledger rows so far) — now serialized.
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.credit_ledger
   where student_id = p_student_id and tenant_id = p_tenant_id;
  if v_balance < v_cost then
    raise exception 'insufficient tegoed: balance % min < cost % min', v_balance, v_cost;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  -- Mag niet over een bezet agenda-blok / examen / TTT / theorie geboekt worden.
  if public._appointment_overlaps(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at) then
    raise exception 'het gekozen tijdslot valt over een bestaande agenda-afspraak (blok/examen/toets) van deze instructeur';
  end if;

  insert into public.lessons (
    tenant_id, instructor_id, student_id,
    starts_at, ends_at, status, location, notes, credits_cost, created_by,
    location_lat, location_lng, location_place_id
  ) values (
    p_tenant_id, p_instructor_id, p_student_id,
    p_starts_at, v_ends_at, 'planned', p_location, p_notes, v_cost, p_actor,
    p_location_lat, p_location_lng, p_location_place_id
  )
  returning id into v_lesson_id;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
  ) values (
    p_tenant_id, p_student_id, -v_cost, 'lesson_consumed',
    'lesson', v_lesson_id,
    'Les ingepland', p_actor
  );

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.scheduled', 'lesson', v_lesson_id::text,
    jsonb_build_object(
      'instructor_id', p_instructor_id,
      'student_id',    p_student_id,
      'starts_at',     p_starts_at,
      'ends_at',       v_ends_at,
      'duration_min',  p_duration_min,
      'credits_cost',  v_cost
    )
  );

  return v_lesson_id;
end;
$$;
revoke all on function public.schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text, double precision, double precision, text) from public;
revoke execute on function public.schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text, double precision, double precision, text) from anon, authenticated;
grant execute on function public.schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text, double precision, double precision, text) to service_role;

-- Welke types koppelen aan een leerling? (examen/TTT/theorie). Blok-types nooit.
create or replace function public._appointment_type_allows_student(
  p_type public.agenda_appointment_type
) returns boolean
language sql
immutable
as $$
  select p_type in ('exam', 'interim_test', 'theory_guidance');
$$;

-- create_agenda_appointment: maak een afspraak (les-achtig of blok). Schrijft
-- nooit naar credit_ledger. Staf-only via _lesson_actor_authorized.
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
  p_notes         text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_ends_at    timestamptz;
  v_student_id uuid;
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
  if v_student_id is not null and not exists (
    select 1 from public.students
     where id = v_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'leerling % niet gevonden in tenant %', v_student_id, p_tenant_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  if not public._agenda_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'het gekozen tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  insert into public.agenda_appointments (
    tenant_id, instructor_id, student_id, type, status,
    starts_at, ends_at, title, location, notes, created_by
  ) values (
    p_tenant_id, p_instructor_id, v_student_id, p_type, 'planned',
    p_starts_at, v_ends_at, p_title, p_location, p_notes, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.created', 'agenda_appointment', v_id::text,
    jsonb_build_object(
      'type',          p_type,
      'instructor_id', p_instructor_id,
      'student_id',    v_student_id,
      'starts_at',     p_starts_at,
      'ends_at',       v_ends_at
    )
  );

  return v_id;
end;
$$;
revoke all on function public.create_agenda_appointment(uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text) from public;
revoke execute on function public.create_agenda_appointment(uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text) from anon, authenticated;
grant execute on function public.create_agenda_appointment(uuid, uuid, uuid, public.agenda_appointment_type, timestamptz, integer, uuid, text, text, text) to service_role;

-- update_agenda_appointment: tijd/leerling/labels bewerken. Type is onveranderlijk.
create or replace function public.update_agenda_appointment(
  p_appointment_id uuid,
  p_tenant_id      uuid,
  p_actor          uuid,
  p_starts_at      timestamptz,
  p_duration_min   integer,
  p_student_id     uuid default null,
  p_title          text default null,
  p_location       text default null,
  p_notes          text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt       record;
  v_ends_at    timestamptz;
  v_student_id uuid;
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
  if v_student_id is not null and not exists (
    select 1 from public.students
     where id = v_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'leerling % niet gevonden in tenant %', v_student_id, p_tenant_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  if not public._agenda_slot_is_free(
    p_tenant_id, v_appt.instructor_id, p_starts_at, v_ends_at, v_appt.id
  ) then
    raise exception 'het nieuwe tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  update public.agenda_appointments
     set starts_at  = p_starts_at,
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
      'from',         v_appt.starts_at,
      'to',           p_starts_at,
      'ends_at',      v_ends_at,
      'student_id',   v_student_id
    )
  );
end;
$$;
revoke all on function public.update_agenda_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text) from public;
revoke execute on function public.update_agenda_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text) from anon, authenticated;
grant execute on function public.update_agenda_appointment(uuid, uuid, uuid, timestamptz, integer, uuid, text, text, text) to service_role;

-- delete_agenda_appointment: harde verwijdering (geen tegoed/ledger-impact),
-- met audit-spoor. Het audit_log is insert-only, dus het spoor blijft bestaan.
create or replace function public.delete_agenda_appointment(
  p_appointment_id uuid,
  p_tenant_id      uuid,
  p_actor          uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt record;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_appt
    from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id
   for update;
  if v_appt.id is null then
    raise exception 'afspraak % niet gevonden in tenant %', p_appointment_id, p_tenant_id;
  end if;

  delete from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.deleted', 'agenda_appointment', p_appointment_id::text,
    jsonb_build_object(
      'type',          v_appt.type,
      'instructor_id', v_appt.instructor_id,
      'starts_at',     v_appt.starts_at,
      'ends_at',       v_appt.ends_at
    )
  );
end;
$$;
revoke all on function public.delete_agenda_appointment(uuid, uuid, uuid) from public;
revoke execute on function public.delete_agenda_appointment(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.delete_agenda_appointment(uuid, uuid, uuid) to service_role;
