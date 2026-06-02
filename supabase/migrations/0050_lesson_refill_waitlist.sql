-- 0050_lesson_refill_waitlist.sql
-- Task #93 — Wachtlijst & uitnodigingsflow (semi-automatisch herbezetten).
--
-- Tot nu toe was "herbezetten bij een vrijgekomen blok" impliciet: leerlingen met
-- tegoed zonder geplande les scoorden hoger in de kandidatenlijst (Task #87/#92).
-- Deze migratie maakt het expliciet en semi-automatisch:
--
--   1. Leerlingen kunnen in de PWA aanzetten dat ze beschikbaar zijn voor extra
--      lessen bij vrijgekomen tijd (met optionele voorkeursmomenten). Opgeslagen
--      op de students-rij; gemuteerd via een vergrendelde RPC (leerling zelf /
--      voogd / staf) met audit.
--   2. Een uitnodigingen-tabel (lesson_refill_invitations) met status en
--      geldigheidsduur. Staf nodigt een geschikte leerling uit voor een specifiek
--      vrijgekomen blok; de leerling bevestigt of weigert in de PWA. Bij
--      bevestiging wordt de les atomisch geboekt (tegoed-ledger + audit +
--      conflictbewaking) en de overige openstaande uitnodigingen voor dat blok
--      vervallen. Bij weigeren/verlopen blijft het blok open.
--
-- Hergebruikt de bestaande conventies: tenant_id op elke rij, select-only RLS,
-- vergrendelde SECURITY DEFINER RPC's (service_role), audit_log insert-only.
-- Boeken gebeurt nooit zonder bevestiging van de leerling (semi-automatisch).

-- ===========================================================================
-- 1. Opt-in op de students-rij
-- ===========================================================================
-- Aparte vlag t.o.v. preferred_dayparts (0048): dat is een algemene voorkeur,
-- dit is een expliciete "nodig mij uit bij vrijgekomen tijd"-opt-in met eigen,
-- optionele voorkeursmomenten.
alter table public.students
  add column if not exists refill_opt_in boolean not null default false;
alter table public.students
  add column if not exists refill_preferred_dayparts text[] not null default '{}';

create index if not exists idx_students_refill_opt_in
  on public.students (tenant_id)
  where refill_opt_in = true;

-- set_student_refill_preference: leerling zelf (students.user_id), voogd
-- (student_guardians) of staf mag de opt-in + voorkeuren zetten. Dayparts
-- gevalideerd tegen dezelfde set als de intake/daypart-voorkeur.
create or replace function public.set_student_refill_preference(
  p_tenant_id  uuid,
  p_actor      uuid,
  p_student_id uuid,
  p_opt_in     boolean,
  p_dayparts   text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean      text[];
  v_authorized boolean;
begin
  -- Autorisatie: staf, of de leerling zelf, of een gekoppelde voogd.
  v_authorized := public._lesson_actor_authorized(p_actor, p_tenant_id)
    or exists (
      select 1 from public.students s
       where s.id = p_student_id
         and s.tenant_id = p_tenant_id
         and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = p_student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to set refill preference for student %', p_actor, p_student_id;
  end if;

  v_clean := coalesce(p_dayparts, '{}');
  if exists (
    select 1 from unnest(v_clean) d
     where d not in ('morning', 'afternoon', 'evening', 'weekend')
  ) then
    raise exception 'invalid daypart in %', v_clean;
  end if;
  -- Voorkeursmomenten alleen zinvol als de opt-in aan staat.
  if not coalesce(p_opt_in, false) then
    v_clean := '{}';
  end if;

  update public.students
     set refill_opt_in = coalesce(p_opt_in, false),
         refill_preferred_dayparts = v_clean
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.refill_preference_set', 'student', p_student_id::text,
    jsonb_build_object('opt_in', coalesce(p_opt_in, false), 'dayparts', to_jsonb(v_clean))
  );
end;
$$;
revoke all on function public.set_student_refill_preference(uuid, uuid, uuid, boolean, text[]) from public;
revoke execute on function public.set_student_refill_preference(uuid, uuid, uuid, boolean, text[]) from anon, authenticated;
grant execute on function public.set_student_refill_preference(uuid, uuid, uuid, boolean, text[]) to service_role;

-- ===========================================================================
-- 2. Uitnodigingen-tabel
-- ===========================================================================
do $$ begin
  create type public.lesson_refill_invitation_status as enum (
    'pending',
    'accepted',
    'declined',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.lesson_refill_invitations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  student_id      uuid not null,
  instructor_id   uuid not null references auth.users(id) on delete cascade,
  -- De geannuleerde les die het blok vrijmaakte (optioneel, alleen context).
  source_lesson_id uuid references public.lessons(id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  duration_min    integer not null check (duration_min >= 15),
  location        text,
  location_lat    double precision,
  location_lng    double precision,
  location_place_id text,
  status          public.lesson_refill_invitation_status not null default 'pending',
  expires_at      timestamptz not null,
  score           integer not null default 0,
  reason          text,
  -- De geboekte les bij bevestiging (null tot acceptatie).
  booked_lesson_id uuid references public.lessons(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint lesson_refill_invitations_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade
);

drop trigger if exists lesson_refill_invitations_set_updated_at on public.lesson_refill_invitations;
create trigger lesson_refill_invitations_set_updated_at
  before update on public.lesson_refill_invitations
  for each row execute function public.set_updated_at();

create index if not exists idx_lesson_refill_inv_tenant_status
  on public.lesson_refill_invitations (tenant_id, status);
create index if not exists idx_lesson_refill_inv_student_status
  on public.lesson_refill_invitations (student_id, status, expires_at);
create index if not exists idx_lesson_refill_inv_tenant_starts
  on public.lesson_refill_invitations (tenant_id, starts_at);
create index if not exists idx_lesson_refill_inv_instructor_starts
  on public.lesson_refill_invitations (instructor_id, starts_at);
-- Eén openstaande uitnodiging per leerling per exact blok (instructeur+tijd).
create unique index if not exists uq_lesson_refill_inv_pending_per_block
  on public.lesson_refill_invitations (tenant_id, student_id, instructor_id, starts_at, ends_at)
  where status = 'pending';

-- RLS: alleen lezen. Staf ziet alle uitnodigingen in de tenant; een leerling of
-- gekoppelde voogd ziet uitsluitend de eigen uitnodigingen. Schrijven gaat
-- altijd via de RPC's hieronder (service_role).
alter table public.lesson_refill_invitations enable row level security;

drop policy if exists lesson_refill_inv_select on public.lesson_refill_invitations;
create policy lesson_refill_inv_select on public.lesson_refill_invitations
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = lesson_refill_invitations.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1 from public.students s
       where s.id = lesson_refill_invitations.student_id
         and s.user_id = auth.uid()
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = lesson_refill_invitations.student_id
         and g.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- 3. RPC: uitnodiging aanmaken (staf)
-- ===========================================================================
-- Staf nodigt een leerling uit voor een specifiek vrijgekomen blok. Dwingt de
-- tenant-regels af die door de applicatielaag worden meegegeven (al gesanitiseerd
-- + geklemd): aan/uit, geldigheidsduur, max. gelijktijdige kandidaten per blok.
create or replace function public.create_lesson_refill_invitation(
  p_tenant_id        uuid,
  p_actor            uuid,
  p_student_id       uuid,
  p_instructor_id    uuid,
  p_starts_at        timestamptz,
  p_duration_min     integer,
  p_enabled          boolean,
  p_valid_minutes    integer,
  p_max_candidates   integer,
  p_location         text default null,
  p_location_lat     double precision default null,
  p_location_lng     double precision default null,
  p_location_place_id text default null,
  p_source_lesson_id uuid default null,
  p_score            integer default 0,
  p_reason           text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_ends_at timestamptz;
  v_valid   integer;
  v_max     integer;
  v_open    integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not coalesce(p_enabled, true) then
    raise exception 'herbezet-uitnodigingen staan uit voor deze rijschool';
  end if;
  if p_duration_min is null or p_duration_min < 15 then
    raise exception 'duur moet minimaal 15 minuten zijn';
  end if;

  v_valid := greatest(coalesce(p_valid_minutes, 1440), 1);
  v_max   := greatest(coalesce(p_max_candidates, 3), 1);

  -- Instructeur moet lid zijn van de tenant.
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructeur % is geen lid van tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- Leerling moet in de tenant bestaan.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'leerling % niet gevonden in tenant %', p_student_id, p_tenant_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  -- Het blok moet (nog) vrij zijn t.o.v. lessen, proeflessen en afspraken.
  if not public._agenda_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'het gekozen tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  -- Max. gelijktijdige openstaande (niet-verlopen) kandidaten voor dit blok.
  select count(*) into v_open
    from public.lesson_refill_invitations i
   where i.tenant_id = p_tenant_id
     and i.instructor_id = p_instructor_id
     and i.starts_at = p_starts_at
     and i.ends_at = v_ends_at
     and i.status = 'pending'
     and i.expires_at > now();
  if v_open >= v_max then
    raise exception 'maximaal aantal gelijktijdige kandidaten (%) voor dit blok bereikt', v_max;
  end if;

  insert into public.lesson_refill_invitations (
    tenant_id, student_id, instructor_id, source_lesson_id,
    starts_at, ends_at, duration_min,
    location, location_lat, location_lng, location_place_id,
    status, expires_at, score, reason, created_by
  ) values (
    p_tenant_id, p_student_id, p_instructor_id, p_source_lesson_id,
    p_starts_at, v_ends_at, p_duration_min,
    p_location, p_location_lat, p_location_lng, p_location_place_id,
    'pending', now() + make_interval(mins => v_valid), coalesce(p_score, 0), p_reason, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson_refill.invited', 'lesson_refill_invitation', v_id::text,
    jsonb_build_object(
      'student_id',    p_student_id,
      'instructor_id', p_instructor_id,
      'starts_at',     p_starts_at,
      'ends_at',       v_ends_at,
      'duration_min',  p_duration_min,
      'valid_minutes', v_valid
    )
  );

  return v_id;
end;
$$;
revoke all on function public.create_lesson_refill_invitation(uuid, uuid, uuid, uuid, timestamptz, integer, boolean, integer, integer, text, double precision, double precision, text, uuid, integer, text) from public;
revoke execute on function public.create_lesson_refill_invitation(uuid, uuid, uuid, uuid, timestamptz, integer, boolean, integer, integer, text, double precision, double precision, text, uuid, integer, text) from anon, authenticated;
grant execute on function public.create_lesson_refill_invitation(uuid, uuid, uuid, uuid, timestamptz, integer, boolean, integer, integer, text, double precision, double precision, text, uuid, integer, text) to service_role;

-- ===========================================================================
-- 4. RPC: uitnodiging beantwoorden (leerling bevestigt/weigert)
-- ===========================================================================
-- Leerling (of voogd/staf) bevestigt of weigert. Lazy-expiry: een verlopen
-- uitnodiging wordt gemarkeerd als 'expired' en boekt nooit. Bij bevestiging
-- wordt de les atomisch geboekt — dezelfde logica als schedule_lesson
-- (balanscheck + tegoed-ledger + audit + conflictbewaking) — en de overige
-- openstaande uitnodigingen voor hetzelfde blok vervallen ('cancelled').
create or replace function public.respond_lesson_refill_invitation(
  p_invitation_id uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_accept        boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv          public.lesson_refill_invitations;
  v_authorized   boolean;
  v_balance      integer;
  v_booking_actor uuid;
  v_lesson_id    uuid;
begin
  select * into v_inv
    from public.lesson_refill_invitations
   where id = p_invitation_id and tenant_id = p_tenant_id
   for update;
  if v_inv.id is null then
    raise exception 'uitnodiging % niet gevonden in tenant %', p_invitation_id, p_tenant_id;
  end if;

  -- Autorisatie: staf, of de leerling zelf, of een gekoppelde voogd.
  v_authorized := public._lesson_actor_authorized(p_actor, p_tenant_id)
    or exists (
      select 1 from public.students s
       where s.id = v_inv.student_id and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_inv.student_id and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to respond to invitation %', p_actor, p_invitation_id;
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'uitnodiging % is niet meer open (status=%)', p_invitation_id, v_inv.status;
  end if;

  -- Lazy-expiry: verlopen → markeren en stoppen (boekt nooit).
  if v_inv.expires_at <= now() then
    update public.lesson_refill_invitations
       set status = 'expired'
     where id = v_inv.id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'lesson_refill.expired', 'lesson_refill_invitation', v_inv.id::text,
      jsonb_build_object('expires_at', v_inv.expires_at)
    );
    raise exception 'uitnodiging % is verlopen', p_invitation_id;
  end if;

  -- Weigeren: status bijwerken, blok blijft open.
  if not coalesce(p_accept, false) then
    update public.lesson_refill_invitations
       set status = 'declined', responded_at = now()
     where id = v_inv.id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'lesson_refill.declined', 'lesson_refill_invitation', v_inv.id::text,
      jsonb_build_object('student_id', v_inv.student_id)
    );
    return null;
  end if;

  -- ---- Bevestigen: les atomisch boeken (mirror van schedule_lesson) --------
  -- Boek namens de uitnodigende staf zodat ledger/audit consistent zijn met
  -- een normaal geplande les; valt terug op de responder als created_by weg is.
  v_booking_actor := coalesce(v_inv.created_by, p_actor);

  -- Leerlingrij vergrendelen zodat gelijktijdige boekingen serialiseren op de
  -- balanscheck.
  perform 1 from public.students
   where id = v_inv.student_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'leerling % niet gevonden in tenant %', v_inv.student_id, p_tenant_id;
  end if;

  -- Balanscheck: voldoende tegoed (in minuten) voor de lesduur. Betaalflow bij
  -- onvoldoende tegoed valt buiten scope — hier hard blokkeren met nette fout.
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.credit_ledger
   where student_id = v_inv.student_id and tenant_id = p_tenant_id;
  if v_balance < v_inv.duration_min then
    raise exception 'onvoldoende tegoed: % min beschikbaar, % min nodig', v_balance, v_inv.duration_min;
  end if;

  -- Slot moet nog vrij zijn (kan ondertussen geboekt zijn).
  if not public._agenda_slot_is_free(p_tenant_id, v_inv.instructor_id, v_inv.starts_at, v_inv.ends_at, null) then
    raise exception 'het tijdslot is niet meer beschikbaar';
  end if;

  insert into public.lessons (
    tenant_id, instructor_id, student_id,
    starts_at, ends_at, status, location, notes, credits_cost, created_by,
    location_lat, location_lng, location_place_id
  ) values (
    p_tenant_id, v_inv.instructor_id, v_inv.student_id,
    v_inv.starts_at, v_inv.ends_at, 'planned', v_inv.location,
    'Herbezet via uitnodiging', v_inv.duration_min, v_booking_actor,
    v_inv.location_lat, v_inv.location_lng, v_inv.location_place_id
  )
  returning id into v_lesson_id;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
  ) values (
    p_tenant_id, v_inv.student_id, -v_inv.duration_min, 'lesson_consumed',
    'lesson', v_lesson_id, 'Les ingepland (herbezet)', v_booking_actor
  );

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    v_booking_actor, p_tenant_id, 'lesson.scheduled', 'lesson', v_lesson_id::text,
    jsonb_build_object(
      'instructor_id', v_inv.instructor_id,
      'student_id',    v_inv.student_id,
      'starts_at',     v_inv.starts_at,
      'ends_at',       v_inv.ends_at,
      'duration_min',  v_inv.duration_min,
      'credits_cost',  v_inv.duration_min,
      'source',        'lesson_refill_invitation'
    )
  );

  -- Uitnodiging accepteren.
  update public.lesson_refill_invitations
     set status = 'accepted', responded_at = now(), booked_lesson_id = v_lesson_id
   where id = v_inv.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson_refill.accepted', 'lesson_refill_invitation', v_inv.id::text,
    jsonb_build_object('student_id', v_inv.student_id, 'lesson_id', v_lesson_id)
  );

  -- Overige openstaande uitnodigingen voor exact hetzelfde blok vervallen.
  update public.lesson_refill_invitations
     set status = 'cancelled', responded_at = now()
   where tenant_id = p_tenant_id
     and instructor_id = v_inv.instructor_id
     and starts_at = v_inv.starts_at
     and ends_at = v_inv.ends_at
     and id <> v_inv.id
     and status = 'pending';

  return v_lesson_id;
end;
$$;
revoke all on function public.respond_lesson_refill_invitation(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.respond_lesson_refill_invitation(uuid, uuid, uuid, boolean) from anon, authenticated;
grant execute on function public.respond_lesson_refill_invitation(uuid, uuid, uuid, boolean) to service_role;

-- ===========================================================================
-- 5. RPC: uitnodiging intrekken (staf)
-- ===========================================================================
create or replace function public.cancel_lesson_refill_invitation(
  p_invitation_id uuid,
  p_tenant_id     uuid,
  p_actor         uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.lesson_refill_invitations;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_inv
    from public.lesson_refill_invitations
   where id = p_invitation_id and tenant_id = p_tenant_id
   for update;
  if v_inv.id is null then
    raise exception 'uitnodiging % niet gevonden in tenant %', p_invitation_id, p_tenant_id;
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'uitnodiging % is niet meer open (status=%)', p_invitation_id, v_inv.status;
  end if;

  update public.lesson_refill_invitations
     set status = 'cancelled', responded_at = now()
   where id = v_inv.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson_refill.cancelled', 'lesson_refill_invitation', v_inv.id::text,
    jsonb_build_object('student_id', v_inv.student_id)
  );
end;
$$;
revoke all on function public.cancel_lesson_refill_invitation(uuid, uuid, uuid) from public;
revoke execute on function public.cancel_lesson_refill_invitation(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.cancel_lesson_refill_invitation(uuid, uuid, uuid) to service_role;

-- ===========================================================================
-- 6. Notificatietypes: uitnodiging + bevestiging
-- ===========================================================================
-- Zelfde drop-by-definitie-patroon als 0045: de oorspronkelijke CHECKs zijn
-- auto-named; we vinden ze op definitie en vervangen door named CHECKs met de
-- twee nieuwe types erbij.
do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
      from pg_constraint
     where contype = 'c'
       and conrelid in (
         'public.notification_log'::regclass,
         'public.notification_templates'::regclass
       )
       and pg_get_constraintdef(oid) ilike '%payment_confirmation%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_type_check
  check (type in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed'
  ));

alter table public.notification_templates
  add constraint notification_templates_key_check
  check (key in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed'
  ));
