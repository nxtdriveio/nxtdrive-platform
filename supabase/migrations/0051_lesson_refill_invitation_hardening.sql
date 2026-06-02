-- ===========================================================================
-- 0051 — Wachtlijst/herbezet-uitnodigingen: hardening (Task #93 follow-up)
--
-- Twee correctheids-/contractfixes op de RPC's uit 0050:
--
--  1. create_lesson_refill_invitation: dwingt nu op DB-niveau af dat de leerling
--     zich heeft aangemeld (students.refill_opt_in = true). De wachtlijst is een
--     opt-in-flow; ook een service-role-aanroeper die de UI-scoringslaag omzeilt
--     mag geen niet-aangemelde leerling uitnodigen.
--
--  2. respond_lesson_refill_invitation: de lazy-expiry-tak markeerde de
--     uitnodiging als 'expired' + schreef audit en deed daarna `raise`, wat de
--     transactie (incl. die statuswijziging + audit) terugrolt — misleidende
--     dode code. De tak stopt nu hard vóór enige mutatie. Lees-filters sluiten
--     verlopen uitnodigingen al uit op `expires_at`, dus een verlopen rij is
--     functioneel dood zonder statuswijziging.
--
-- Beide functies gebruiken `create or replace`, dus dit is idempotent en
-- herhaalbaar toe te passen.
-- ===========================================================================

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

  -- Contract: alleen leerlingen die zich hebben aangemeld (opt-in) mogen voor
  -- vrijgekomen tijd worden uitgenodigd.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id
       and s.tenant_id = p_tenant_id
       and s.refill_opt_in = true
  ) then
    raise exception 'leerling % heeft zich niet aangemeld voor herbezet-uitnodigingen', p_student_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  -- Serialiseer gelijktijdige creates voor exact hetzelfde blok (instructeur +
  -- start + eind) zodat de max-kandidaten-telling en de dubbel-check race-veilig
  -- zijn: zonder deze lock is het een check-then-insert die onder concurrency de
  -- cap kan overschrijden. De lock geldt enkel binnen deze transactie.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || p_instructor_id::text || ':' ||
      p_starts_at::text || ':' || v_ends_at::text,
      0
    )
  );

  -- Het blok moet (nog) vrij zijn t.o.v. lessen, proeflessen en afspraken.
  if not public._agenda_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'het gekozen tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  -- Geen dubbele openstaande uitnodiging voor dezelfde leerling + hetzelfde blok.
  -- We tellen ALLE pending rijen (ook reeds verlopen-maar-nog-pending), zodat dit
  -- exact overeenkomt met de partial unique index uq_lesson_refill_inv_pending_per_block
  -- en een nette NL-fout geeft i.p.v. een rauwe unique-violation. Opruimen van
  -- verlopen pending rijen gebeurt door de aparte expiry-sweep.
  if exists (
    select 1 from public.lesson_refill_invitations i
     where i.tenant_id = p_tenant_id
       and i.student_id = p_student_id
       and i.instructor_id = p_instructor_id
       and i.starts_at = p_starts_at
       and i.ends_at = v_ends_at
       and i.status = 'pending'
  ) then
    raise exception 'er staat al een openstaande uitnodiging voor deze leerling op dit blok';
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

  -- Lazy-expiry: verlopen → hard stoppen vóór enige mutatie (boekt nooit). We
  -- schrijven hier bewust geen 'expired'-status: een raise rolt die toch terug.
  -- De lees-filters sluiten verlopen uitnodigingen al uit op expires_at, dus een
  -- verlopen rij is functioneel dood zonder statuswijziging.
  if v_inv.expires_at <= now() then
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
