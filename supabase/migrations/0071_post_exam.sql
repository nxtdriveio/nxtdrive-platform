-- ===========================================================================
-- 0071 — Examenflow C: na-examen (geslaagd & gezakt)
--
-- Drie uitbreidingen op bestaande, beproefde patronen:
--
--   1. 'exam_passed' + 'exam_failed' toevoegen aan de notification_log/
--      notification_templates CHECK-constraints, zodat de bestaande dispatch-
--      laag een (white-label-bewuste, idempotente) uitslag-mail kan loggen.
--      Geen nieuwe providerkoppeling — bestaande degradatie (skipped) volstaat.
--      Zelfde drop-then-readd patroon als 0070.
--
--   2. set_student_review_consent_self(): de leerling (of diens voogd) mag de
--      eigen review-/social-media-toestemming zetten — AVG: expliciete,
--      self-service toestemming. Spiegelt set_student_review_consent (0052),
--      maar autoriseert op eigenaarschap (students.user_id = actor) OF een
--      voogd-relatie (student_guardians) i.p.v. tenant_admin. Altijd geaudit.
--
--   3. finish_student_traject(): zet een leerling op inactief (active=false)
--      nadat het traject is afgerond. Admin-only, idempotent, altijd geaudit.
--
-- Alle RPC's: SECURITY DEFINER + alleen service_role (anon/authenticated
-- revoked), in lijn met de canon — gevoelige mutaties zijn uitsluitend
-- server-side.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 'exam_passed' + 'exam_failed' toevoegen aan de notificatie-CHECK-constraints
-- ---------------------------------------------------------------------------
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
    'lesson_refill_confirmed',
    'payment_reminder',
    'exam_invitation',
    'exam_confirmed',
    'exam_planned',
    'exam_passed',
    'exam_failed'
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
    'lesson_refill_confirmed',
    'payment_reminder',
    'exam_invitation',
    'exam_confirmed',
    'exam_planned',
    'exam_passed',
    'exam_failed'
  ));

-- ---------------------------------------------------------------------------
-- 2. set_student_review_consent_self — leerling/voogd zet eigen toestemming
-- ---------------------------------------------------------------------------
-- AVG: expliciete, self-service toestemming. Autorisatie op eigenaarschap
-- (de leerling zelf) of een voogd-relatie binnen dezelfde tenant. Altijd
-- geaudit, net als de admin-variant (0052).
create or replace function public.set_student_review_consent_self(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_consent    boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor is null then
    raise exception 'actor is required';
  end if;

  if not exists (
    select 1 from public.students s
     where s.id = p_student_id
       and s.tenant_id = p_tenant_id
       and s.user_id = p_actor
  ) and not exists (
    select 1 from public.student_guardians g
     where g.student_id = p_student_id
       and g.tenant_id  = p_tenant_id
       and g.user_id    = p_actor
  ) then
    raise exception 'actor % not authorized for student % in tenant %',
      p_actor, p_student_id, p_tenant_id;
  end if;

  update public.students
     set review_consent    = coalesce(p_consent, false),
         review_consent_at = now(),
         review_consent_by = p_actor
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.review_consent_self_set', 'student', p_student_id::text,
    jsonb_build_object('consent', coalesce(p_consent, false))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. finish_student_traject — rond het traject af (leerling op inactief)
-- ---------------------------------------------------------------------------
-- Admin-only (of platform-admin). Idempotent: een al-inactieve leerling levert
-- geen fout op. Altijd geaudit.
create or replace function public.finish_student_traject(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.memberships m
     where m.user_id   = p_actor
       and m.tenant_id = p_tenant_id
       and m.role      = 'tenant_admin'
  ) and not exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % not authorized (admin only) for tenant %', p_actor, p_tenant_id;
  end if;

  update public.students
     set active = false
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.traject_finished', 'student', p_student_id::text,
    jsonb_build_object('active', false)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grant lockdown — service_role only (anon/authenticated revoked).
-- ---------------------------------------------------------------------------
revoke all     on function public.set_student_review_consent_self(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.set_student_review_consent_self(uuid, uuid, uuid, boolean) from anon, authenticated;
grant  execute on function public.set_student_review_consent_self(uuid, uuid, uuid, boolean) to service_role;

revoke all     on function public.finish_student_traject(uuid, uuid, uuid) from public;
revoke execute on function public.finish_student_traject(uuid, uuid, uuid) from anon, authenticated;
grant  execute on function public.finish_student_traject(uuid, uuid, uuid) to service_role;
