-- ===========================================================================
-- Task #166 — Leerling self-service les verzetten (rescheduling).
--
-- Naast zelf annuleren (student_cancel_lesson, 0077/0078) kan een leerling/voogd
-- nu een eigen geplande, toekomstige les naar een nieuw moment verplaatsen.
-- Belangrijke regels:
--   - Tegoed blijft behouden: een les verbruikt tegoed bij het inplannen; bij
--     verzetten verandert de duur niet, dus er is GEEN credit_ledger-mutatie
--     (geen refund/recharge-churn).
--   - Zelfde opzegtermijn (`min_notice_hours` uit `cancellation_policy`) als bij
--     self-cancel, getoetst op de OORSPRONKELIJKE starttijd.
--   - Harde toekomst-invariant: een al begonnen/voorbije les kan niet verzet
--     worden; het nieuwe moment moet strikt in de toekomst liggen.
--   - Instructeurbeschikbaarheid wordt gerespecteerd: het nieuwe slot mag niet
--     overlappen met een andere geplande les (de les zelf uitgesloten), een
--     actieve proefles, of een gepland agenda-blok van dezelfde instructeur.
--   - Insert-only audit-rij. Service-role only — de server action stuurt de actor
--     door en de RPC her-valideert eigendom.
-- ===========================================================================

create or replace function public.student_reschedule_lesson(
  p_lesson_id     uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_new_starts_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson       record;
  v_authorized   boolean;
  v_policy       jsonb;
  v_min_notice   numeric := 0;
  v_hours_before numeric;
  v_duration_min integer;
  v_new_ends_at  timestamptz;
begin
  -- Lock de les en haal de eigenaar op vóór de autorisatiecheck.
  select id, tenant_id, student_id, instructor_id, starts_at, ends_at, status
    into v_lesson
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_lesson.id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  -- Autorisatie: de leerling zelf, of een gekoppelde voogd (NIET via een losse
  -- membership-rij — alleen de echte eigenaar mag zijn eigen les verzetten).
  v_authorized := exists (
      select 1 from public.students s
       where s.id = v_lesson.student_id
         and s.tenant_id = p_tenant_id
         and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_lesson.student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to reschedule lesson %', p_actor, p_lesson_id;
  end if;

  if v_lesson.status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_lesson.status;
  end if;

  -- Harde toekomst-invariant op de OORSPRONKELIJKE les: een les op/na de
  -- starttijd kan nooit zelf verzet worden, ongeacht het beleid.
  if v_lesson.starts_at <= now() then
    raise exception 'lesson % has already started (starts_at=%)',
      p_lesson_id, v_lesson.starts_at
      using errcode = 'check_violation';
  end if;

  -- Het nieuwe moment moet strikt in de toekomst liggen.
  if p_new_starts_at is null or p_new_starts_at <= now() then
    raise exception 'new start must be in the future'
      using errcode = 'check_violation';
  end if;

  v_hours_before := greatest(
    0,
    extract(epoch from (v_lesson.starts_at - now())) / 3600.0
  );

  select value into v_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id and key = 'cancellation_policy';

  -- Minimale opzegtermijn afdwingen (alleen voor self-service; 0 = geen),
  -- getoetst op de oorspronkelijke starttijd — net als bij self-cancel.
  v_min_notice := coalesce((v_policy ->> 'min_notice_hours')::numeric, 0);
  if v_min_notice > 0 and v_hours_before < v_min_notice then
    raise exception 'reschedule too late: % hours before < min notice % hours',
      round(v_hours_before, 2), v_min_notice
      using errcode = 'check_violation';
  end if;

  -- Duur (en dus tegoedkosten) blijft behouden: geen ledger-mutatie nodig.
  v_duration_min := greatest(
    15,
    round(extract(epoch from (v_lesson.ends_at - v_lesson.starts_at)) / 60.0)::integer
  );
  v_new_ends_at := p_new_starts_at + make_interval(mins => v_duration_min);

  -- Instructeurbeschikbaarheid: het nieuwe slot mag niet overlappen met een
  -- andere geplande les (deze les uitgesloten), een actieve proefles, of een
  -- gepland agenda-blok van dezelfde instructeur. De lessons_no_overlap
  -- exclusion-constraint is een backstop voor de les-vs-les-overlap.
  if exists (
    select 1 from public.lessons l
     where l.tenant_id = p_tenant_id
       and l.instructor_id = v_lesson.instructor_id
       and l.id <> p_lesson_id
       and l.status = 'planned'
       and tstzrange(l.starts_at, l.ends_at, '[)')
           && tstzrange(p_new_starts_at, v_new_ends_at, '[)')
  ) or exists (
    select 1 from public.trial_lessons t
     where t.tenant_id = p_tenant_id
       and t.instructor_id = v_lesson.instructor_id
       and t.status in ('provisional', 'confirmed')
       and tstzrange(t.starts_at, t.ends_at, '[)')
           && tstzrange(p_new_starts_at, v_new_ends_at, '[)')
  ) or exists (
    select 1 from public.agenda_appointments a
     where a.tenant_id = p_tenant_id
       and a.instructor_id = v_lesson.instructor_id
       and a.status = 'planned'
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(p_new_starts_at, v_new_ends_at, '[)')
  ) then
    raise exception 'new slot % overlaps an existing appointment', p_new_starts_at
      using errcode = 'check_violation';
  end if;

  update public.lessons
     set starts_at = p_new_starts_at,
         ends_at   = v_new_ends_at
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.rescheduled', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'from',             v_lesson.starts_at,
      'to',               p_new_starts_at,
      'duration_min',     v_duration_min,
      'self_reschedule',  true
    )
  );

  return v_new_ends_at;
end;
$$;
revoke all on function public.student_reschedule_lesson(uuid, uuid, uuid, timestamptz) from public;
revoke execute on function public.student_reschedule_lesson(uuid, uuid, uuid, timestamptz) from anon, authenticated;
grant execute on function public.student_reschedule_lesson(uuid, uuid, uuid, timestamptz) to service_role;
