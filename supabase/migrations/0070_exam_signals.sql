-- ===========================================================================
-- 0070 — Examenflow B: schoolsignalen → taak + notificatie 'examen ingepland'
--
-- Twee uitbreidingen op de bestaande, beproefde patronen:
--
--   1. ensure_exam_signal_task(): zet een afgeleid schoolsignaal rond een
--      aankomend examen met één klik om naar een Kanban-taak. Idempotent (één
--      open taak per dedupe_key), gekoppeld aan het examenmoment
--      (task_links.entity_type = 'exam'), en gerouteerd via de bestaande
--      taak-toewijzingsregels (resolve_task_assignment). Spiegelt exact
--      ensure_lead_intake_task (0044): instructeur-geïnitieerd, dus task_type
--      'manual' zodat de lead-automation-sweep ze nooit stilletjes opruimt.
--
--   2. 'exam_planned' toevoegen aan de notification_log/notification_templates
--      CHECK-constraints, zodat de bestaande dispatch-laag een (white-label-
--      bewuste, idempotente) "examen ingepland"-mail kan loggen. Geen nieuwe
--      providerkoppeling — bestaande degradatie (skipped) volstaat.
--
-- SECURITY DEFINER + alleen service_role (anon/authenticated revoked), in lijn
-- met de canon: taakmutaties zijn uitsluitend server-side.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: schoolsignaal → taak (idempotent, gekoppeld aan het examenmoment)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_exam_signal_task(
  p_tenant_id      uuid,
  p_actor          uuid,
  p_appointment_id uuid,
  p_dedupe_key     text,
  p_title          text,
  p_description    text,
  p_priority       public.task_priority,
  p_due_date       date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_appt     record;
  v_board    uuid;
  v_column   uuid;
  v_dept     uuid;
  v_rule     uuid;
  v_pos      integer;
  v_id       uuid;
begin
  -- Actor is verplicht: deze taken zijn altijd instructeur/admin-geïnitieerd.
  if p_actor is null or not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  -- Het examenmoment moet bestaan in deze tenant en een examen/TTT zijn.
  select id, type into v_appt
    from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id;
  if v_appt.id is null then
    raise exception 'afspraak % niet gevonden in tenant %', p_appointment_id, p_tenant_id;
  end if;
  if v_appt.type not in ('exam', 'interim_test') then
    raise exception 'signaaltaak alleen mogelijk voor examen of tussentijdse toets (type=%)', v_appt.type;
  end if;

  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) = 0 then
    raise exception 'dedupe_key is required';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'task title is required';
  end if;

  -- Idempotency: een open taak met deze sleutel dekt het signaal al.
  select id into v_existing
    from public.tasks
   where tenant_id = p_tenant_id
     and dedupe_key = p_dedupe_key
     and archived_at is null
   limit 1;
  if found then
    return v_existing;
  end if;

  -- Route via de toewijzingsregels van de tenant (keyword → afdeling + bord).
  select ra.rule_id, ra.department_id, ra.board_id
    into v_rule, v_dept, v_board
    from public.resolve_task_assignment(p_tenant_id, btrim(p_title)) ra;

  -- Doelkolom: de eerste kolom van het gematchte bord; anders het eerste
  -- niet-gearchiveerde bord.
  if v_board is not null then
    select id into v_column
      from public.task_columns
     where board_id = v_board and tenant_id = p_tenant_id
     order by sort_order, created_at
     limit 1;
  end if;

  if v_column is null then
    select c.id, c.board_id into v_column, v_board
      from public.task_columns c
      join public.task_boards b
        on b.id = c.board_id and b.tenant_id = c.tenant_id
     where c.tenant_id = p_tenant_id
       and b.archived_at is null
     order by b.sort_order, b.created_at, c.sort_order
     limit 1;
  end if;

  -- Bootstrap een bord als de tenant er nog geen heeft (mirror van 0044).
  if v_column is null then
    insert into public.task_boards (tenant_id, name, sort_order)
    values (p_tenant_id, 'Taken', 0)
    returning id into v_board;
    insert into public.task_columns (tenant_id, board_id, name, sort_order)
    values
      (p_tenant_id, v_board, 'Te doen', 10),
      (p_tenant_id, v_board, 'Bezig',   20),
      (p_tenant_id, v_board, 'Klaar',   30);
    select id into v_column
      from public.task_columns
     where board_id = v_board and tenant_id = p_tenant_id
     order by sort_order
     limit 1;
    v_dept := null;
  end if;

  -- Houd department_id consistent met het bord waar we landen.
  if v_dept is null then
    select department_id into v_dept
      from public.task_boards
     where id = v_board and tenant_id = p_tenant_id;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
    from public.tasks
   where column_id = v_column and tenant_id = p_tenant_id and archived_at is null;

  insert into public.tasks (
    tenant_id, board_id, column_id, department_id, title, description,
    priority, due_date, position, created_by, task_type, dedupe_key
  ) values (
    p_tenant_id, v_board, v_column, v_dept, btrim(p_title), p_description,
    coalesce(p_priority, 'normal'), p_due_date, v_pos, p_actor,
    'manual', p_dedupe_key
  )
  returning id into v_id;

  insert into public.task_links (tenant_id, task_id, entity_type, entity_id, created_by)
  values (p_tenant_id, v_id, 'exam', p_appointment_id, p_actor)
  on conflict (task_id, entity_type, entity_id) do nothing;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'task.exam_signal_created', 'task', v_id::text,
    jsonb_build_object(
      'appointment_id', p_appointment_id::text, 'dedupe_key', p_dedupe_key,
      'department_id', v_dept, 'assignment_rule_id', v_rule, 'source', 'exam_signal'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.ensure_exam_signal_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) from public;
revoke execute on function public.ensure_exam_signal_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) from anon, authenticated;
grant execute on function public.ensure_exam_signal_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) to service_role;

-- ---------------------------------------------------------------------------
-- 2. 'exam_planned' toevoegen aan de notificatie-CHECK-constraints
-- ---------------------------------------------------------------------------
-- Zelfde drop-then-readd patroon als 0068: vind de bestaande CHECK-constraints
-- via hun inhoud en herbouw ze met de volledige (uitgebreide) lijst.
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
    'exam_planned'
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
    'exam_planned'
  ));
